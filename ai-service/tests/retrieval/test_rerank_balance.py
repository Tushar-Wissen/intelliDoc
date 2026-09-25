"""Story 6.3 — T6.3-01 through T6.3-05, plus empty and validation paths."""

from __future__ import annotations

import uuid

import pytest

from app.db.repository import ChunkRecord, DocumentRecord
from app.llm.client import CallableLlmClient, RulesLlmClient
from app.retrieval.config import RetrievalConfig
from app.retrieval.errors import RetrievalError
from app.retrieval.keyword_search import KeywordSearcher
from app.retrieval.merger import ScoredChunk
from app.retrieval.reranker import OverlapReranker, RerankerError
from app.retrieval.schemas import AnswerMode, RetrievalRequest, ScopeType
from app.retrieval.service import RetrievalService
from app.retrieval.vector_search import VectorSearcher
from tests.fakes import InMemoryGraphStore, InMemoryPipelineRepository, OverlapEmbeddingModel
from tests.retrieval.world import DOC_A, DOC_B, FINANCE, build_world, fast_config


def test_t6_3_01_reranker_promotes_a_chunk_that_rrf_ranked_low():
    relevant = _chunk(DOC_A, "termination notice is the relevant passage")
    noise = [_chunk(DOC_A, f"unrelated filler {index}") for index in range(3)]

    class Channels:
        def __init__(self, chunks):
            self._chunks = chunks

        def search(self, *_args, **_kwargs):
            return list(self._chunks)

    class ScriptedReranker:
        def rerank(self, _query, texts):
            return [10.0 if "relevant passage" in text else 0.1 for text in texts]

    service = _service_with_channels(
        vector_chunks=noise,
        keyword_chunks=[*noise, relevant],
        reranker=ScriptedReranker(),
    )
    package = service.retrieve(_comparison_request())
    assert package.chunks[0].text == relevant.chunk_text
    assert package.diagnostics.rerankSkipped is False


def test_t6_3_02_reranker_failure_keeps_rrf_order():
    first = _chunk(DOC_A, "first by fusion")
    second = _chunk(DOC_A, "second passage")

    class Fixed:
        def __init__(self, chunks):
            self._chunks = chunks

        def search(self, *_args, **_kwargs):
            return list(self._chunks)

    class Down:
        def rerank(self, _query, _texts):
            raise RerankerError("down")

    service = _service_with_channels(
        vector_chunks=[first],
        keyword_chunks=[first, second],
        reranker=Down(),
    )
    package = service.retrieve(_comparison_request())
    assert package.diagnostics.rerankSkipped is True
    assert package.chunks[0].chunkId == first.id


def test_t6_3_03_comparison_includes_both_documents():
    world = build_world()
    service = RetrievalService(
        repo=world.repo,
        store=world.store,
        llm=RulesLlmClient(),
        embedder=world.embedder,
        reranker=OverlapReranker(),
        config=fast_config(),
    )
    package = service.retrieve(
        RetrievalRequest(
            workspaceId=FINANCE,
            resolvedDocumentIds=[DOC_A, DOC_B],
            scopeType=ScopeType.DOCUMENTS,
            question="What's different between these two contracts?",
            answerMode=AnswerMode.RETRIEVAL_PLUS_GRAPH,
            requestId="req-balance",
        )
    )
    assert package.questionType.value == "comparison"
    documents = {chunk.documentId for chunk in package.chunks}
    assert DOC_A in documents
    assert DOC_B in documents


def test_t6_3_05_fanout_fetches_a_document_missing_from_the_merge():
    repo = InMemoryPipelineRepository()
    doc_a = uuid.uuid4()
    doc_b = uuid.uuid4()
    workspace = uuid.uuid4()
    for document_id, name in ((doc_a, "A.pdf"), (doc_b, "B.pdf")):
        repo.add_document(
            DocumentRecord(
                id=document_id,
                file_name=name,
                file_type="pdf",
                storage_path="x",
                processing_status="READY",
                workspace_id=workspace,
            )
        )
    chunk_a = _chunk(doc_a, "dense termination text")
    chunk_b = _chunk(doc_b, "the other contract termination clause")
    calls: list[set[uuid.UUID]] = []

    class CrowdingRepo(InMemoryPipelineRepository):
        def scoped_vector_search(self, workspace_id, document_ids, query_embedding, k):
            calls.append(set(document_ids))
            if set(document_ids) == {doc_b}:
                return [chunk_b]
            return [chunk_a]

        def scoped_keyword_search(self, workspace_id, document_ids, query_text, k):
            if set(document_ids) == {doc_b}:
                return [chunk_b]
            return [chunk_a]

        def scoped_trigram_search(self, workspace_id, document_ids, query_text, k):
            return []

    crowding = CrowdingRepo()
    crowding.documents = repo.documents
    crowding.chunks = {doc_a: [chunk_a], doc_b: [chunk_b]}
    crowding.sections = {}
    service = RetrievalService(
        repo=crowding,
        store=InMemoryGraphStore(),
        llm=RulesLlmClient(),
        embedder=OverlapEmbeddingModel(),
        reranker=OverlapReranker(),
        config=RetrievalConfig(balance_fanout_max_docs=6, package_max_chunks=4, db_timeout_ms=5000),
    )
    package = service.retrieve(
        RetrievalRequest(
            workspaceId=workspace,
            resolvedDocumentIds=[doc_a, doc_b],
            scopeType=ScopeType.DOCUMENTS,
            question="What's different between these two contracts?",
            answerMode=AnswerMode.RETRIEVAL_ONLY,
            requestId="req-fanout",
        )
    )
    assert {chunk.documentId for chunk in package.chunks} == {doc_a, doc_b}
    assert {doc_b} in calls


def test_empty_question_and_all_non_ready_documents():
    world = build_world()
    service = RetrievalService(
        repo=world.repo,
        store=world.store,
        llm=RulesLlmClient(),
        embedder=world.embedder,
        reranker=OverlapReranker(),
        config=fast_config(),
    )
    with pytest.raises(RetrievalError) as caught:
        service.retrieve(
            RetrievalRequest(
                workspaceId=FINANCE,
                resolvedDocumentIds=[DOC_A],
                scopeType=ScopeType.DOCUMENTS,
                question="  ",
                answerMode=AnswerMode.RETRIEVAL_ONLY,
                requestId="req-empty",
            )
        )
    assert caught.value.code == "INVALID_QUESTION"
    from tests.retrieval.world import DOC_INDEXING

    package = service.retrieve(
        RetrievalRequest(
            workspaceId=FINANCE,
            resolvedDocumentIds=[DOC_INDEXING],
            scopeType=ScopeType.DOCUMENTS,
            question="Anything indexed?",
            answerMode=AnswerMode.RETRIEVAL_PLUS_GRAPH,
            requestId="req-indexing",
        )
    )
    assert package.chunks == []
    assert package.diagnostics.excludedDocumentIds == [DOC_INDEXING]
    assert package.diagnostics.graphStatus == "SKIPPED"


def _service_with_channels(*, vector_chunks, keyword_chunks, reranker):
    repo = InMemoryPipelineRepository()
    repo.add_document(
        DocumentRecord(
            id=DOC_A,
            file_name="Contract-A.pdf",
            file_type="pdf",
            storage_path="x",
            processing_status="READY",
            workspace_id=FINANCE,
        )
    )

    class FixedVector(VectorSearcher):
        def search(self, *_args, **_kwargs):
            return list(vector_chunks)

    class FixedKeyword(KeywordSearcher):
        def search(self, *_args, **_kwargs):
            return list(keyword_chunks)

    return RetrievalService(
        repo=repo,
        store=InMemoryGraphStore(),
        llm=CallableLlmClient(lambda _prompt, _schema: {"type": "fact", "rewrittenQuery": "termination notice"}),
        embedder=OverlapEmbeddingModel(),
        reranker=reranker,
        config=fast_config(),
        vector_searcher=FixedVector(repo),
        keyword_searcher=FixedKeyword(repo),
    )


def _comparison_request() -> RetrievalRequest:
    return RetrievalRequest(
        workspaceId=FINANCE,
        resolvedDocumentIds=[DOC_A],
        scopeType=ScopeType.DOCUMENTS,
        question="What is the termination notice?",
        answerMode=AnswerMode.RETRIEVAL_ONLY,
        requestId="req-rerank",
    )


def _chunk(document_id, text: str) -> ChunkRecord:
    return ChunkRecord(
        id=uuid.uuid4(),
        document_id=document_id,
        section_id=None,
        page_number=1,
        chunk_text=text,
        token_count=8,
    )
