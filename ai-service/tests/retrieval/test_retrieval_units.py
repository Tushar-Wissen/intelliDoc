"""Unit coverage for config, merger, balancer, scope filter, and the package builder."""

from __future__ import annotations

import inspect
import json
import uuid
from pathlib import Path

import pytest

from app.db.repository import ChunkRecord, SqlAlchemyPipelineRepository
from app.retrieval.balancer import balance
from app.retrieval.config import RetrievalConfig
from app.retrieval.errors import RetrievalError
from app.retrieval.graph_scope_filter import Hop, admit
from app.retrieval.merger import ScoredChunk, merge
from app.retrieval.package_builder import build_package
from app.retrieval.schemas import (
    AnswerMode,
    EvidencePackage,
    QuestionType,
    RetrievalDiagnostics,
    RetrievalRequest,
    ScopeType,
)
from app.retrieval.scope_guard import ScopeGuard
from tests.fakes import InMemoryPipelineRepository
from tests.retrieval.world import DOC_A, DOC_B, FINANCE, build_world


def test_config_defaults_and_env_override(monkeypatch):
    config = RetrievalConfig.from_env()
    assert config.vector_top_k == 20
    assert config.package_max_tokens == 3000
    assert config.balance_max_share == 0.6
    assert config.graph_failure == "degrade"
    monkeypatch.setenv("RETRIEVAL_VECTOR_TOP_K", "7")
    monkeypatch.setenv("RETRIEVAL_GRAPH_FAILURE", "fail")
    overridden = RetrievalConfig.from_env()
    assert overridden.vector_top_k == 7
    assert overridden.graph_failure == "fail"


def test_golden_evidence_package_matches_the_contract():
    path = Path(__file__).resolve().parents[1] / "fixtures" / "retrieval" / "golden_evidence_package.json"
    package = EvidencePackage.model_validate(json.loads(path.read_text(encoding="utf-8")))
    assert package.questionType is QuestionType.COMPARISON
    assert package.answerMode is AnswerMode.RETRIEVAL_PLUS_GRAPH
    assert package.chunks[0].provenance == ["vector", "keyword"]


def test_t6_2_04_three_channels_collapse_to_one_candidate():
    chunk = _chunk(DOC_A, "shared")
    merged = merge(
        {"vector": [chunk], "keyword": [chunk], "graph": [chunk]},
        rrf_k=60,
        cap=40,
    )
    assert len(merged) == 1
    assert merged[0].provenance == ["vector", "keyword", "graph"]


def test_graph_scope_filter_truth_table():
    allowed = {"doc-a"}
    assert admit(
        Hop("ws", "Document", "doc-a", None, "MENTIONS"),
        workspace_id="ws",
        resolved_document_ids=allowed,
    )
    assert not admit(
        Hop("ws", "Document", "doc-b", None, "AMENDS"),
        workspace_id="ws",
        resolved_document_ids=allowed,
    )
    assert not admit(
        Hop("other", "Document", "doc-a", None, "MENTIONS"),
        workspace_id="ws",
        resolved_document_ids=allowed,
    )
    assert not admit(
        Hop("ws", "Document", "doc-a", "doc-b", "MENTIONS"),
        workspace_id="ws",
        resolved_document_ids=allowed,
    )
    assert admit(
        Hop("ws", "DateFact", "doc-a", None, "EXPIRES_ON"),
        workspace_id="ws",
        resolved_document_ids=allowed,
    )
    assert not admit(
        Hop("ws", "DateFact", "doc-b", None, "EXPIRES_ON"),
        workspace_id="ws",
        resolved_document_ids=allowed,
    )
    assert admit(
        Hop("ws", "Organization", "doc-b", None, "SIGNED"),
        workspace_id="ws",
        resolved_document_ids=allowed,
    )
    assert not admit(
        Hop("ws", "DateFact", "doc-a", None, "CONTRADICTS"),
        workspace_id="ws",
        resolved_document_ids=allowed,
    )


def test_t6_3_04_share_cap_holds_while_other_documents_still_have_candidates():
    doc_a = uuid.uuid4()
    doc_b = uuid.uuid4()
    candidates = [
        _scored(doc_a, score=10 - index) for index in range(6)
    ] + [
        _scored(doc_b, score=9 - index) for index in range(6)
    ]
    config = RetrievalConfig(package_max_chunks=5, balance_max_share=0.4)
    selected, counts, _fanout = balance(
        candidates,
        question_type="comparison",
        document_ids=[doc_a, doc_b],
        config=config,
        fanout=None,
    )
    assert sum(counts.values()) == len(selected)
    assert max(counts.values()) <= 2


def test_share_cap_lifts_when_the_other_document_has_no_candidates():
    doc_a = uuid.uuid4()
    candidates = [_scored(doc_a, score=float(index)) for index in range(6)]
    config = RetrievalConfig(package_max_chunks=5, balance_max_share=0.4)
    selected, counts, _fanout = balance(
        candidates,
        question_type="comparison",
        document_ids=[doc_a],
        config=config,
        fanout=None,
    )
    assert counts[str(doc_a)] == 5
    assert len(selected) == 5


def test_t6_3_06_zero_candidates_build_an_empty_package():
    request = _request([DOC_A])
    package = build_package(
        request=request,
        question_type="fact",
        rewritten_query="expiry",
        selected=[],
        facts=[],
        contradictions=[],
        diagnostics=_diagnostics(),
        document_names={DOC_A: "Contract-A.pdf"},
        section_headings={},
        config=RetrievalConfig(),
    )
    assert package.chunks == []
    assert package.graphFacts == []


def test_t6_3_07_package_uses_chunk_text_and_citation_fields():
    chunk = _chunk(DOC_A, "Termination clauses require thirty days written notice.")
    selected = [ScoredChunk(chunk=chunk, provenance=["vector"], rrf_score=0.2, score=0.9)]
    package = build_package(
        request=_request([DOC_A]),
        question_type="fact",
        rewritten_query="termination",
        selected=selected,
        facts=[],
        contradictions=[],
        diagnostics=_diagnostics(),
        document_names={DOC_A: "Contract-A.pdf"},
        section_headings={chunk.section_id: "Expiry"},
        config=RetrievalConfig(package_max_tokens=3000),
    )
    assert package.chunks[0].chunkId == chunk.id
    assert package.chunks[0].text == chunk.chunk_text
    assert package.chunks[0].sectionHeading == "Expiry"
    assert package.chunks[0].documentName == "Contract-A.pdf"


def test_token_budget_drops_the_lowest_score_first():
    high = _chunk(DOC_A, "alpha")
    low = _chunk(DOC_A, "beta")
    high.token_count = 100
    low.token_count = 100
    selected = [
        ScoredChunk(chunk=high, provenance=["vector"], rrf_score=0.2, score=0.9),
        ScoredChunk(chunk=low, provenance=["vector"], rrf_score=0.1, score=0.1),
    ]
    package = build_package(
        request=_request([DOC_A]),
        question_type="fact",
        rewritten_query="alpha",
        selected=selected,
        facts=[],
        contradictions=[],
        diagnostics=_diagnostics(),
        document_names={DOC_A: "Contract-A.pdf"},
        section_headings={},
        config=RetrievalConfig(package_max_tokens=100),
    )
    assert [item.chunkId for item in package.chunks] == [high.id]


def test_builder_rejects_a_chunk_outside_the_resolved_scope():
    outsider = uuid.uuid4()
    selected = [ScoredChunk(chunk=_chunk(outsider, "secret"), provenance=["vector"], rrf_score=1, score=1)]
    with pytest.raises(RetrievalError) as caught:
        build_package(
            request=_request([DOC_A]),
            question_type="fact",
            rewritten_query="secret",
            selected=selected,
            facts=[],
            contradictions=[],
            diagnostics=_diagnostics(),
            document_names={},
            section_headings={},
            config=RetrievalConfig(),
        )
    assert caught.value.code == "SCOPE_VIOLATION"


def test_scope_guard_reports_non_ready_and_rejects_foreign_ids():
    world = build_world()
    guard = ScopeGuard(world.repo)
    from tests.retrieval.world import DOC_GOV, DOC_INDEXING

    decision = guard.validate(FINANCE, [DOC_A, DOC_INDEXING])
    assert decision.ready_ids == [DOC_A]
    assert decision.excluded_ids == [DOC_INDEXING]
    with pytest.raises(RetrievalError) as caught:
        guard.validate(FINANCE, [DOC_A, DOC_GOV])
    assert caught.value.code == "SCOPE_VIOLATION"
    with pytest.raises(RetrievalError) as empty:
        guard.validate(FINANCE, [])
    assert empty.value.code == "INVALID_SCOPE"


def test_scoped_sql_predicates_include_workspace_and_ready_status():
    for method in (
        SqlAlchemyPipelineRepository.scoped_vector_search,
        SqlAlchemyPipelineRepository.scoped_keyword_search,
        SqlAlchemyPipelineRepository.scoped_trigram_search,
        SqlAlchemyPipelineRepository.scoped_chunks_by_ids,
    ):
        source = inspect.getsource(method)
        assert "workspace_id" in source
        assert "READY" in source
        assert "document_id" in source


def test_in_memory_scoped_search_drops_other_workspaces_and_non_ready_documents():
    world = build_world()
    from tests.retrieval.world import CHUNK_GOV, CHUNK_INDEX, DOC_GOV, DOC_INDEXING

    hits = world.repo.scoped_keyword_search(
        FINANCE,
        [DOC_A, DOC_B, DOC_INDEXING, DOC_GOV],
        "SENTINEL",
        10,
    )
    identifiers = {chunk.id for chunk in hits}
    assert CHUNK_INDEX not in identifiers
    assert CHUNK_GOV not in identifiers


def _chunk(document_id: uuid.UUID, text: str) -> ChunkRecord:
    return ChunkRecord(
        id=uuid.uuid4(),
        document_id=document_id,
        section_id=uuid.uuid4(),
        page_number=1,
        chunk_text=text,
        token_count=10,
    )


def _scored(document_id: uuid.UUID, score: float) -> ScoredChunk:
    return ScoredChunk(
        chunk=_chunk(document_id, f"text-{score}"),
        provenance=["vector"],
        rrf_score=score,
        score=score,
    )


def _request(document_ids: list[uuid.UUID]) -> RetrievalRequest:
    return RetrievalRequest(
        workspaceId=FINANCE,
        resolvedDocumentIds=document_ids,
        scopeType=ScopeType.DOCUMENTS,
        question="expiry",
        answerMode=AnswerMode.RETRIEVAL_PLUS_GRAPH,
        requestId="req-unit",
    )


def _diagnostics() -> RetrievalDiagnostics:
    return RetrievalDiagnostics(
        graphStatus="OK",
        rerankSkipped=False,
        vectorCount=0,
        keywordCount=0,
        graphChunkCount=0,
        mergedCount=0,
        excludedDocumentIds=[],
        vectorLatencyMs=0,
        keywordLatencyMs=0,
        graphLatencyMs=0,
        totalLatencyMs=0,
    )
