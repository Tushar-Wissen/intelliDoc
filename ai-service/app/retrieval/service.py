"""Orchestrates classification, hybrid retrieval, reranking, and the evidence package."""

from __future__ import annotations

import logging
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout

from pydantic import ValidationError

from app.db.repository import PipelineRepository, get_repository
from app.pipeline.embedding_model import EmbeddingModel
from app.pipeline.kg import contradictions_in_scope
from app.retrieval.balancer import balance
from app.retrieval.config import RetrievalConfig
from app.retrieval.errors import RetrievalError
from app.retrieval.graph_retriever import GraphChannel, GraphRetriever
from app.retrieval.keyword_search import KeywordSearcher
from app.retrieval.merger import ScoredChunk, merge
from app.retrieval.package_builder import build_package
from app.retrieval.question_classifier import QuestionClassifier
from app.retrieval.reranker import Reranker, RerankerError, get_reranker
from app.retrieval.schemas import (
    AnswerMode,
    ContradictionPair,
    ContradictionSide,
    EvidencePackage,
    RetrievalDiagnostics,
    RetrievalRequest,
)
from app.retrieval.scope_guard import ScopeGuard
from app.retrieval.vector_search import VectorSearcher

logger = logging.getLogger(__name__)


class RetrievalService:
    def __init__(
        self,
        *,
        repo: PipelineRepository | None = None,
        store=None,
        llm=None,
        embedder: EmbeddingModel | None = None,
        reranker: Reranker | None = None,
        config: RetrievalConfig | None = None,
        vector_searcher: VectorSearcher | None = None,
        keyword_searcher: KeywordSearcher | None = None,
        graph_retriever: GraphRetriever | None = None,
    ) -> None:
        self._config = config or RetrievalConfig.from_env()
        self._repo = repo or get_repository()
        self._store = store
        self._reranker = reranker
        self._scope = ScopeGuard(self._repo)
        self._classifier = QuestionClassifier(llm=llm, config=self._config)
        self._vector = vector_searcher or VectorSearcher(self._repo, embedder, self._config)
        self._keyword = keyword_searcher or KeywordSearcher(self._repo, self._config)
        self._graph = graph_retriever or GraphRetriever(self._repo, store, self._config)

    def retrieve(self, request: RetrievalRequest | dict) -> EvidencePackage:
        started = time.perf_counter()
        parsed = self._parse(request)
        self._validate_question(parsed)
        try:
            decision = self._read(lambda: self._scope.validate(parsed.workspaceId, parsed.resolvedDocumentIds))
        except RetrievalError as exc:
            if exc.code == "SCOPE_VIOLATION":
                logger.error(
                    "Scope violation requestId=%s workspaceId=%s",
                    parsed.requestId,
                    parsed.workspaceId,
                )
            raise
        classification = self._classifier.classify_and_rewrite(
            parsed.question,
            scope_type=parsed.scopeType.value,
            document_count=len(decision.ready_ids) or len(parsed.resolvedDocumentIds),
            conversation_context=parsed.conversationContext,
            request_id=parsed.requestId,
        )
        use_graph = (
            parsed.answerMode == AnswerMode.RETRIEVAL_PLUS_GRAPH
            and self._config.graph_channel_enabled
            and bool(decision.ready_ids)
        )
        if not decision.ready_ids:
            package = self._package(
                parsed,
                classification.question_type,
                classification.rewritten_query,
                [],
                [],
                [],
                self._diagnostics(
                    graph_status="SKIPPED",
                    rerank_skipped=False,
                    vector_count=0,
                    keyword_count=0,
                    graph_count=0,
                    merged_count=0,
                    excluded=decision.excluded_ids,
                    vector_ms=0,
                    keyword_ms=0,
                    graph_ms=0,
                    started=started,
                ),
            )
            self._log(parsed, package)
            return package

        vector_hits, keyword_hits, graph_channel, timings, graph_status = self._channels(
            parsed,
            classification.rewritten_query,
            classification.verbatim_terms,
            decision.ready_ids,
            classification.question_type,
            use_graph,
        )
        merged = merge(
            {"vector": vector_hits, "keyword": keyword_hits, "graph": graph_channel.chunks},
            rrf_k=self._config.rrf_k,
            cap=self._config.merge_max_candidates,
        )
        reranked, rerank_skipped = self._apply_rerank(classification.rewritten_query, merged)
        contradictions = (
            self._contradictions(parsed.workspaceId, decision.ready_ids, parsed.requestId)
            if use_graph and graph_status == "OK"
            else []
        )
        selected, _counts, fanout_fired = balance(
            reranked,
            question_type=classification.question_type,
            document_ids=decision.ready_ids,
            config=self._config,
            fanout=lambda document_id: self._fanout(
                classification.rewritten_query,
                classification.verbatim_terms,
                parsed.workspaceId,
                document_id,
                rerank_skipped,
            ),
        )
        package = self._package(
            parsed,
            classification.question_type,
            classification.rewritten_query,
            selected,
            graph_channel.facts if graph_status == "OK" else [],
            contradictions,
            self._diagnostics(
                graph_status=graph_status,
                rerank_skipped=rerank_skipped,
                vector_count=len(vector_hits),
                keyword_count=len(keyword_hits),
                graph_count=len(graph_channel.chunks),
                merged_count=len(merged),
                excluded=decision.excluded_ids,
                vector_ms=timings["vector"],
                keyword_ms=timings["keyword"],
                graph_ms=timings["graph"],
                started=started,
            ),
        )
        logger.info(
            "Retrieval complete requestId=%s questionType=%s scopeType=%s scopeSize=%s "
            "answerMode=%s vectorCount=%s keywordCount=%s graphChunkCount=%s mergedCount=%s "
            "chunkCount=%s graphStatus=%s rerankSkipped=%s fanout=%s graphDiscarded=%s "
            "durationMs=%s",
            parsed.requestId,
            package.questionType.value,
            parsed.scopeType.value,
            len(parsed.resolvedDocumentIds),
            package.answerMode.value,
            package.diagnostics.vectorCount,
            package.diagnostics.keywordCount,
            package.diagnostics.graphChunkCount,
            package.diagnostics.mergedCount,
            len(package.chunks),
            package.diagnostics.graphStatus,
            package.diagnostics.rerankSkipped,
            fanout_fired,
            graph_channel.discarded,
            package.diagnostics.totalLatencyMs,
        )
        return package

    def _channels(
        self,
        request: RetrievalRequest,
        rewritten: str,
        terms: list[str],
        document_ids: list[uuid.UUID],
        question_type: str,
        use_graph: bool,
    ):
        timeout = self._config.db_timeout_ms / 1000
        graph_timeout = self._config.graph_timeout_ms / 1000

        def vector_call():
            started = time.perf_counter()
            hits = self._read(
                lambda: self._vector.search(rewritten, request.workspaceId, document_ids)
            )
            return hits, int((time.perf_counter() - started) * 1000)

        def keyword_call():
            started = time.perf_counter()
            hits = self._read(
                lambda: self._keyword.search(rewritten, terms, request.workspaceId, document_ids)
            )
            return hits, int((time.perf_counter() - started) * 1000)

        def graph_call():
            started = time.perf_counter()
            try:
                channel = self._graph.retrieve(
                    request.question,
                    rewritten,
                    request.workspaceId,
                    document_ids,
                    question_type,
                )
                return channel, "OK", int((time.perf_counter() - started) * 1000)
            except RetrievalError:
                raise
            except Exception as exc:
                logger.error(
                    "Graph retrieval failed requestId=%s reason=%s",
                    request.requestId,
                    type(exc).__name__,
                )
                if self._config.graph_failure == "fail":
                    raise RetrievalError("GRAPH_UNAVAILABLE", "Graph retrieval failed") from exc
                empty = GraphChannel(chunks=[], facts=[], discarded=0)
                return empty, "FAILED", int((time.perf_counter() - started) * 1000)

        with ThreadPoolExecutor(max_workers=3) as pool:
            vector_future = pool.submit(vector_call)
            keyword_future = pool.submit(keyword_call)
            graph_future = pool.submit(graph_call) if use_graph else None
            vector_hits, vector_ms = self._await_channel(vector_future, timeout, "Vector")
            keyword_hits, keyword_ms = self._await_channel(keyword_future, timeout, "Keyword")
            if graph_future is None:
                graph_channel = GraphChannel(chunks=[], facts=[], discarded=0)
                graph_status = "SKIPPED"
                graph_ms = 0
            else:
                try:
                    graph_channel, graph_status, graph_ms = graph_future.result(graph_timeout)
                except RetrievalError:
                    raise
                except FuturesTimeout:
                    logger.error("Graph retrieval timed out requestId=%s", request.requestId)
                    if self._config.graph_failure == "fail":
                        raise RetrievalError("GRAPH_UNAVAILABLE", "Graph retrieval timed out")
                    graph_channel = GraphChannel(chunks=[], facts=[], discarded=0)
                    graph_status = "FAILED"
                    graph_ms = self._config.graph_timeout_ms
        return vector_hits, keyword_hits, graph_channel, {
            "vector": vector_ms,
            "keyword": keyword_ms,
            "graph": graph_ms,
        }, graph_status

    def _await_channel(self, future, timeout: float, label: str):
        try:
            return future.result(timeout)
        except RetrievalError:
            raise
        except FuturesTimeout as exc:
            raise RetrievalError("RETRIEVAL_TIMEOUT", f"{label} search timed out") from exc
        except Exception as exc:
            raise RetrievalError("RETRIEVAL_UNAVAILABLE", f"{label} search failed") from exc

    def _apply_rerank(self, query: str, candidates: list[ScoredChunk]) -> tuple[list[ScoredChunk], bool]:
        window = candidates[: self._config.rerank_input_size]
        if not window:
            return [], False
        try:
            scores = self._score(query, [item.chunk.chunk_text for item in window])
        except (RerankerError, TimeoutError, Exception) as exc:
            logger.warning("Reranker fallback reason=%s", type(exc).__name__)
            return window, True
        if len(scores) != len(window):
            logger.warning("Reranker fallback reason=ScoreCountMismatch")
            return window, True
        rescored = [
            ScoredChunk(
                chunk=item.chunk,
                provenance=list(item.provenance),
                rrf_score=item.rrf_score,
                score=score,
            )
            for item, score in zip(window, scores)
        ]
        rescored.sort(key=lambda item: (-item.score, str(item.chunk.id)))
        return rescored, False

    def _score(self, query: str, texts: list[str]) -> list[float]:
        reranker = self._reranker or get_reranker()
        # The timeout is applied by the caller only for channel futures. Rerank stays
        # in-process; a hung model surfaces as RerankerError from the adapter.
        return reranker.rerank(query, texts)

    def _fanout(
        self,
        rewritten: str,
        terms: list[str],
        workspace_id: uuid.UUID,
        document_id: uuid.UUID,
        rerank_skipped: bool,
    ) -> list[ScoredChunk]:
        vector_hits = self._vector.search(rewritten, workspace_id, [document_id])
        keyword_hits = self._keyword.search(rewritten, terms, workspace_id, [document_id])
        merged = merge(
            {"vector": vector_hits, "keyword": keyword_hits, "graph": []},
            rrf_k=self._config.rrf_k,
            cap=self._config.merge_max_candidates,
        )
        if rerank_skipped:
            return merged
        rescored, skipped = self._apply_rerank(rewritten, merged)
        return merged if skipped else rescored

    def _contradictions(self, workspace_id: uuid.UUID, document_ids: list[uuid.UUID], request_id: str):
        try:
            rows = contradictions_in_scope(workspace_id, document_ids, store=self._store)
        except Exception as exc:
            logger.warning(
                "Contradiction lookup unavailable requestId=%s reason=%s",
                request_id,
                type(exc).__name__,
            )
            return []
        pairs: list[ContradictionPair] = []
        for row in rows:
            try:
                pairs.append(
                    ContradictionPair(
                        left=ContradictionSide(
                            factType=row.fact_type,
                            label=row.label,
                            value=row.left_value,
                            documentId=uuid.UUID(str(row.left_document_id)),
                            sourceChunkId=_optional_uuid(row.left_source_chunk_id),
                            sourcePage=row.left_source_page,
                        ),
                        right=ContradictionSide(
                            factType=row.fact_type,
                            label=row.label,
                            value=row.right_value,
                            documentId=uuid.UUID(str(row.right_document_id)),
                            sourceChunkId=_optional_uuid(row.right_source_chunk_id),
                            sourcePage=row.right_source_page,
                        ),
                    )
                )
            except (TypeError, ValueError):
                logger.warning("Skipping contradiction with invalid identifiers requestId=%s", request_id)
        return pairs

    def _package(self, request, question_type, rewritten, selected, facts, contradictions, diagnostics):
        documents = self._repo.list_documents(list(request.resolvedDocumentIds))
        names = {document.id: document.file_name for document in documents}
        section_ids = [
            item.chunk.section_id
            for item in selected
            if item.chunk.section_id is not None
        ]
        headings = self._repo.section_headings(section_ids) if section_ids else {}
        return build_package(
            request=request,
            question_type=question_type,
            rewritten_query=rewritten,
            selected=selected,
            facts=facts,
            contradictions=contradictions,
            diagnostics=diagnostics,
            document_names=names,
            section_headings=headings,
            config=self._config,
        )

    def _diagnostics(
        self,
        *,
        graph_status: str,
        rerank_skipped: bool,
        vector_count: int,
        keyword_count: int,
        graph_count: int,
        merged_count: int,
        excluded: list[uuid.UUID],
        vector_ms: int,
        keyword_ms: int,
        graph_ms: int,
        started: float,
    ) -> RetrievalDiagnostics:
        return RetrievalDiagnostics(
            graphStatus=graph_status,  # type: ignore[arg-type]
            rerankSkipped=rerank_skipped,
            vectorCount=vector_count,
            keywordCount=keyword_count,
            graphChunkCount=graph_count,
            mergedCount=merged_count,
            excludedDocumentIds=list(excluded),
            vectorLatencyMs=vector_ms,
            keywordLatencyMs=keyword_ms,
            graphLatencyMs=graph_ms,
            totalLatencyMs=int((time.perf_counter() - started) * 1000),
        )

    def _log(self, request: RetrievalRequest, package: EvidencePackage) -> None:
        logger.info(
            "Retrieval complete requestId=%s questionType=%s scopeType=%s scopeSize=%s "
            "answerMode=%s chunkCount=%s graphStatus=%s durationMs=%s",
            request.requestId,
            package.questionType.value,
            request.scopeType.value,
            len(request.resolvedDocumentIds),
            package.answerMode.value,
            len(package.chunks),
            package.diagnostics.graphStatus,
            package.diagnostics.totalLatencyMs,
        )

    def _read(self, fn):
        last: Exception | None = None
        for _attempt in range(2):
            try:
                return fn()
            except RetrievalError:
                raise
            except Exception as exc:
                last = exc
        raise RetrievalError("RETRIEVAL_UNAVAILABLE", "Database read failed") from last

    def _parse(self, request: RetrievalRequest | dict) -> RetrievalRequest:
        if isinstance(request, RetrievalRequest):
            return request
        try:
            return RetrievalRequest.model_validate(request)
        except ValidationError as exc:
            raise RetrievalError("INVALID_REQUEST", "Retrieval request is invalid") from exc

    def _validate_question(self, request: RetrievalRequest) -> None:
        if not request.question or not request.question.strip():
            raise RetrievalError("INVALID_QUESTION", "Question is empty")
        if len(request.question) > self._config.classifier_max_question_chars:
            raise RetrievalError("INVALID_QUESTION", "Question exceeds the configured length")


def _optional_uuid(value: object) -> uuid.UUID | None:
    if value is None or value == "":
        return None
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError):
        return None
