"""Story 6.2 isolation and hybrid-channel tests. T6.2-01..03, 05..15."""

from __future__ import annotations

import logging

import pytest

from app.llm.client import RulesLlmClient
from app.retrieval.config import RetrievalConfig
from app.retrieval.errors import RetrievalError
from app.retrieval.reranker import OverlapReranker
from app.retrieval.schemas import AnswerMode, RetrievalRequest, ScopeType
from app.retrieval.service import RetrievalService
from tests.retrieval.world import (
    CHUNK_B_SENTINEL,
    CHUNK_IDENTIFIER,
    DOC_A,
    DOC_B,
    DOC_GOV,
    DOC_INDEXING,
    FINANCE,
    GOVERNANCE,
    build_world,
    fast_config,
)


class CountingStore:
    def __init__(self, inner) -> None:
        self.inner = inner
        self.snapshots = 0
        self.contradiction_calls = 0
        self.writes = 0

    def workspace_snapshot(self, workspace_id: str):
        self.snapshots += 1
        return self.inner.workspace_snapshot(workspace_id)

    def contradictions_in_scope(self, workspace_id: str, document_ids: list[str]):
        self.contradiction_calls += 1
        return self.inner.contradictions_in_scope(workspace_id, document_ids)

    def __getattr__(self, name: str):
        attr = getattr(self.inner, name)
        if callable(attr) and (
            name.startswith("merge") or name.startswith("resolve") or name.startswith("write")
        ):
            def wrapped(*args, **kwargs):
                self.writes += 1
                return attr(*args, **kwargs)

            return wrapped
        return attr


def test_t6_2_01_and_03_channels_and_graph_fact():
    package = _retrieve(
        "What is the expiry date for Acme Corp SA-2026-014?",
        [DOC_A, DOC_B],
        AnswerMode.RETRIEVAL_PLUS_GRAPH,
    )
    diagnostics = package.diagnostics
    assert diagnostics.vectorCount > 0
    assert diagnostics.keywordCount > 0
    assert diagnostics.graphChunkCount > 0
    assert any(fact.relationship == "EXPIRES_ON" for fact in package.graphFacts)
    assert any(fact.sourceChunkId is not None for fact in package.graphFacts)


def test_t6_2_02_identifier_is_surfaced_by_the_keyword_channel():
    package = _retrieve("Where is SA-2026-014?", [DOC_A, DOC_B], AnswerMode.RETRIEVAL_ONLY)
    match = next(chunk for chunk in package.chunks if chunk.chunkId == CHUNK_IDENTIFIER)
    assert "keyword" in match.provenance
    assert "SA-2026-014" in match.text


def test_t6_2_05_single_document_scope_excludes_the_other_document():
    package = _retrieve("MODULE_B_UNIQUE_SENTINEL", [DOC_A], AnswerMode.RETRIEVAL_PLUS_GRAPH)
    assert all(chunk.documentId == DOC_A for chunk in package.chunks)
    assert all(fact.documentId == DOC_A for fact in package.graphFacts)
    assert CHUNK_B_SENTINEL not in {chunk.chunkId for chunk in package.chunks}


def test_t6_2_06_module_scope_uses_only_the_resolved_ids():
    package = _retrieve(
        "termination clauses obligations key differences",
        [DOC_A],
        AnswerMode.RETRIEVAL_ONLY,
        scope_type=ScopeType.MODULE,
    )
    assert {chunk.documentId for chunk in package.chunks} <= {DOC_A}


def test_t6_2_07_an_id_outside_the_resolved_list_never_appears():
    package = _retrieve("Acme Corp expiry date", [DOC_A], AnswerMode.RETRIEVAL_PLUS_GRAPH)
    assert DOC_B not in {chunk.documentId for chunk in package.chunks}
    assert DOC_B not in {fact.documentId for fact in package.graphFacts}


def test_t6_2_08_foreign_workspace_id_is_a_hard_failure():
    world = build_world()
    store = CountingStore(world.store)
    service = _service(world, store)
    with pytest.raises(RetrievalError) as caught:
        service.retrieve(_request("Acme Corp", [DOC_A, DOC_GOV], AnswerMode.RETRIEVAL_PLUS_GRAPH))
    assert caught.value.code == "SCOPE_VIOLATION"
    assert store.snapshots == 0
    assert store.writes == 0


def test_t6_2_09_and_10_shared_entity_does_not_pull_the_other_module():
    package = _retrieve("What did Acme Corp agree to?", [DOC_A], AnswerMode.RETRIEVAL_PLUS_GRAPH)
    texts = " ".join(chunk.text for chunk in package.chunks)
    objects = " ".join(fact.object for fact in package.graphFacts)
    assert "2027-06-30" not in texts
    assert "2027-06-30" not in objects
    assert "MODULE_B_UNIQUE_SENTINEL" not in texts
    assert "LEAK_VALUE" not in objects
    assert all(fact.documentId == DOC_A for fact in package.graphFacts)
    assert any(fact.object == "2027-03-31" for fact in package.graphFacts)


def test_t6_2_10b_workspaces_do_not_see_each_other():
    finance = _retrieve("Acme Corp", [DOC_A, DOC_B], AnswerMode.RETRIEVAL_PLUS_GRAPH)
    governance = _retrieve(
        "Acme Corp",
        [DOC_GOV],
        AnswerMode.RETRIEVAL_PLUS_GRAPH,
        workspace_id=GOVERNANCE,
    )
    finance_text = " ".join(chunk.text for chunk in finance.chunks)
    governance_text = " ".join(chunk.text for chunk in governance.chunks)
    assert "GOVERNANCE_SENTINEL" not in finance_text
    assert "MODULE_B_UNIQUE_SENTINEL" not in governance_text
    assert all(fact.documentId != DOC_GOV for fact in finance.graphFacts)
    assert all(chunk.documentId == DOC_GOV for chunk in governance.chunks)


def test_t6_2_11_retrieval_only_skips_the_graph():
    world = build_world()
    store = CountingStore(world.store)
    service = _service(world, store)
    question = "What is the expiry date for Acme Corp?"
    only = service.retrieve(_request(question, [DOC_A, DOC_B], AnswerMode.RETRIEVAL_ONLY))
    assert store.snapshots == 0
    assert store.contradiction_calls == 0
    assert only.graphFacts == []
    assert only.contradictions == []
    assert only.diagnostics.graphStatus == "SKIPPED"
    plus = service.retrieve(_request(question, [DOC_A, DOC_B], AnswerMode.RETRIEVAL_PLUS_GRAPH))
    assert store.snapshots >= 1
    assert plus.graphFacts
    assert {chunk.chunkId for chunk in only.chunks} & {chunk.chunkId for chunk in plus.chunks}


def test_t6_2_12_fact_with_out_of_scope_chunk_is_discarded():
    package = _retrieve("Acme Corp leak marker", [DOC_A], AnswerMode.RETRIEVAL_PLUS_GRAPH)
    assert all(fact.object != "LEAK_VALUE" for fact in package.graphFacts)
    assert CHUNK_B_SENTINEL not in {chunk.chunkId for chunk in package.chunks}


def test_t6_2_13_non_ready_document_is_excluded_and_listed():
    package = _retrieve(
        "INDEXING_SENTINEL",
        [DOC_A, DOC_INDEXING],
        AnswerMode.RETRIEVAL_ONLY,
    )
    assert DOC_INDEXING in package.diagnostics.excludedDocumentIds
    assert all(chunk.documentId != DOC_INDEXING for chunk in package.chunks)
    assert "INDEXING_SENTINEL" not in " ".join(chunk.text for chunk in package.chunks)


def test_t6_2_14_retrieval_does_not_write():
    world = build_world()
    store = CountingStore(world.store)
    service = _service(world, store)
    before = {
        document_id: document.processing_status
        for document_id, document in world.repo.documents.items()
    }
    service.retrieve(_request("Acme Corp expiry", [DOC_A, DOC_B], AnswerMode.RETRIEVAL_PLUS_GRAPH))
    after = {
        document_id: document.processing_status
        for document_id, document in world.repo.documents.items()
    }
    assert before == after
    assert store.writes == 0


def test_t6_2_15_contradiction_is_bounded_to_the_resolved_documents():
    module = _retrieve("Acme Corp expiry date", [DOC_A], AnswerMode.RETRIEVAL_PLUS_GRAPH)
    workspace = _retrieve("Acme Corp expiry date", [DOC_A, DOC_B], AnswerMode.RETRIEVAL_PLUS_GRAPH)
    assert module.contradictions == []
    assert workspace.contradictions
    values = {
        workspace.contradictions[0].left.value,
        workspace.contradictions[0].right.value,
    }
    assert values == {"2027-03-31", "2027-06-30"}


def test_graph_failure_degrades_and_can_fail_hard():
    world = build_world()

    class DownStore(CountingStore):
        def workspace_snapshot(self, workspace_id: str):
            raise RuntimeError("neo4j down")

    degraded = RetrievalService(
        repo=world.repo,
        store=DownStore(world.store),
        llm=RulesLlmClient(),
        embedder=world.embedder,
        reranker=OverlapReranker(),
        config=fast_config(),
    )
    package = degraded.retrieve(
        _request("Acme Corp expiry date", [DOC_A], AnswerMode.RETRIEVAL_PLUS_GRAPH)
    )
    assert package.diagnostics.graphStatus == "FAILED"
    assert package.graphFacts == []
    assert package.chunks

    failing = RetrievalService(
        repo=world.repo,
        store=DownStore(world.store),
        llm=RulesLlmClient(),
        embedder=world.embedder,
        reranker=OverlapReranker(),
        config=RetrievalConfig(graph_failure="fail", db_timeout_ms=5000, graph_timeout_ms=5000),
    )
    with pytest.raises(RetrievalError) as caught:
        failing.retrieve(_request("Acme Corp expiry date", [DOC_A], AnswerMode.RETRIEVAL_PLUS_GRAPH))
    assert caught.value.code == "GRAPH_UNAVAILABLE"


def test_logs_omit_question_and_chunk_text(caplog):
    world = build_world()
    service = _service(world, CountingStore(world.store))
    question = "ZZZ_QUESTION_SENTINEL Acme Corp expiry"
    with caplog.at_level(logging.DEBUG):
        service.retrieve(_request(question, [DOC_A], AnswerMode.RETRIEVAL_PLUS_GRAPH, request_id="req-log"))
    assert "ZZZ_QUESTION_SENTINEL" not in caplog.text
    assert "ZZZ_CHUNK_SENTINEL" not in caplog.text
    assert "req-log" in caplog.text


def _service(world, store) -> RetrievalService:
    return RetrievalService(
        repo=world.repo,
        store=store,
        llm=RulesLlmClient(),
        embedder=world.embedder,
        reranker=OverlapReranker(),
        config=fast_config(),
    )


def _retrieve(question, document_ids, mode, workspace_id=FINANCE, scope_type=ScopeType.DOCUMENTS):
    world = build_world()
    service = _service(world, CountingStore(world.store))
    return service.retrieve(_request(question, document_ids, mode, workspace_id, scope_type))


def _request(question, document_ids, mode, workspace_id=FINANCE, scope_type=ScopeType.DOCUMENTS, request_id="req-iso"):
    return RetrievalRequest(
        workspaceId=workspace_id,
        resolvedDocumentIds=document_ids,
        scopeType=scope_type,
        question=question,
        answerMode=mode,
        requestId=request_id,
    )
