"""Epic 5 — knowledge graph. Stories 5.1–5.4.

Release-blocking checks are the cross-workspace path test (5.3 AC3) and the
cross-workspace contradiction test (5.4 AC4).
"""

from __future__ import annotations

import uuid

import pytest

from app.db.repository import ChunkRecord, DocumentRecord, ExtractedFieldRecord
from app.llm.client import HostedLlmClient, OllamaLlmClient, RulesLlmClient
from app.pipeline.kg import (
    GraphBuildError,
    RulesKgExtractor,
    build_knowledge_graph,
    contradictions_in_scope,
    detect_contradictions,
    resolve_entity,
)
from app.pipeline.kg_schema import (
    RELATIONSHIP_TYPES,
    assert_merge_only,
    normalize_entity_name,
    resolve_entity_cypher,
    simple_kg_pipeline_config,
)
from app.pipeline.llm_provider import build_llm_client
from app.pipeline.neo4j_client import CONTRADICTION_WRITE_CYPHER, _ISOLATION_CYPHER, _SCOPE_CYPHER
from app.pipeline.neo4j_schema_init import ensure_neo4j_schema, schema_statements
from tests.fakes import InMemoryGraphStore, InMemoryPipelineRepository


def test_llm_provider_selects_ollama_hosted_and_rules(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "rules")
    assert isinstance(build_llm_client(), RulesLlmClient)
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    assert isinstance(build_llm_client(), OllamaLlmClient)
    monkeypatch.setenv("LLM_PROVIDER", "hosted")
    client = build_llm_client()
    assert isinstance(client, HostedLlmClient)


def test_schema_disables_lexical_graph_and_library_resolution():
    config = simple_kg_pipeline_config()
    assert config.lexical_graph_enabled is False
    assert config.perform_entity_resolution is False
    assert config.from_file is False
    assert "Chunk" not in config.node_labels
    assert "CONTRADICTS" not in config.relationship_types
    assert set(config.relationship_types) == set(RELATIONSHIP_TYPES)


def test_schema_statements_index_workspace_and_constrain_names():
    statements = schema_statements()
    joined = "\n".join(statements)
    assert "CREATE CONSTRAINT organization_workspace_name" in joined
    assert "CREATE CONSTRAINT person_workspace_name" in joined
    assert "(n.workspace_id, n.normalized_name)" in joined
    assert "FOR (n:Document) ON (n.document_id)" in joined
    assert "FOR (n:Document) ON (n.workspace_id)" in joined
    assert "FOR (n:Document) ON (n.group_id)" in joined
    applied: list[str] = []
    ensure_neo4j_schema(runner=applied.append)
    assert applied == statements


def test_resolution_query_matches_workspace_and_normalized_name():
    cypher = resolve_entity_cypher("Organization")
    assert_merge_only(cypher)
    assert "normalized_name: $normalized_name" in cypher
    assert "workspace_id: $workspace_id" in cypher
    assert_merge_only(CONTRADICTION_WRITE_CYPHER)
    assert "$workspace_id" in _SCOPE_CYPHER
    assert "a.workspace_id <> b.workspace_id" in _ISOLATION_CYPHER
    with pytest.raises(ValueError):
        resolve_entity_cypher("Chunk")


def test_normalize_collapses_case_and_whitespace():
    assert normalize_entity_name("  Acme   Corp ") == "acme corp"
    assert normalize_entity_name("Acme Corp.") != normalize_entity_name("Acme Corporation")


def test_extract_entities_stamp_workspace_document_and_chunk():
    repo, store, workspace_id, document_id, chunk_id = _contract(
        file_name="Contract X.pdf",
        parties="Acme Corp",
        expiry="2027-03-31",
        page=2,
        extra_text="Signed by Jane Doe. Topics: termination clause.",
    )
    build_knowledge_graph(document_id, workspace_id, repo=repo, extractor=RulesKgExtractor(), store=store)

    orgs = store.named_entities(str(workspace_id), "Organization", "acme corp")
    assert len(orgs) == 1
    assert orgs[0]["workspace_id"] == str(workspace_id)
    assert orgs[0]["document_id"] == str(document_id)
    assert orgs[0]["source_chunk_id"] == str(chunk_id)
    assert orgs[0]["source_page"] == 2

    dates = store.facts_for_document(str(document_id), str(workspace_id))
    expiry = next(fact for fact in dates if fact["label"] == "expiry date")
    assert expiry["value"] == "2027-03-31"
    assert expiry["workspace_id"] == str(workspace_id)
    assert expiry["source_chunk_id"] == str(chunk_id)
    persons = store.named_entities(str(workspace_id), "Person")
    assert any(person["name"] == "Jane Doe" and person["source_chunk_id"] == str(chunk_id) for person in persons)
    rels = store.relationship_types_for_document(str(document_id), str(workspace_id))
    assert {"SIGNED", "EXPIRES_ON", "MENTIONS"} <= rels


def test_reprocess_does_not_duplicate_nodes_or_edges():
    repo, store, workspace_id, document_id, _chunk_id = _contract(
        file_name="Contract X.pdf",
        parties="Acme Corp",
        expiry="2027-03-31",
    )
    build_knowledge_graph(document_id, workspace_id, repo=repo, store=store)
    first = store.counts_for_document(str(document_id), str(workspace_id))
    build_knowledge_graph(document_id, workspace_id, repo=repo, store=store)
    second = store.counts_for_document(str(document_id), str(workspace_id))
    assert first == second
    assert first[0] > 1
    assert len(store.named_entities(str(workspace_id), "Organization", "acme corp")) == 1


def test_same_workspace_resolves_to_one_organization_node():
    repo = InMemoryPipelineRepository()
    store = InMemoryGraphStore()
    workspace_id = uuid.uuid4()
    first, _chunk_a = _add_document(
        repo,
        workspace_id,
        "Contract X.pdf",
        parties="Acme Corp",
        expiry="2027-03-31",
    )
    second, _chunk_b = _add_document(
        repo,
        workspace_id,
        "Amendment 2.pdf",
        parties="Acme Corp",
        expiry="2027-06-30",
        amends="Contract X",
    )
    build_knowledge_graph(first, workspace_id, repo=repo, store=store)
    build_knowledge_graph(second, workspace_id, repo=repo, store=store)
    assert len(store.named_entities(str(workspace_id), "Organization", "acme corp")) == 1


def test_cross_workspace_isolation_has_zero_paths():
    finance = uuid.uuid4()
    governance = uuid.uuid4()
    repo = InMemoryPipelineRepository()
    store = InMemoryGraphStore()
    finance_doc, _ = _add_document(repo, finance, "Contract X.pdf", parties="Acme Corp", expiry="2027-03-31")
    governance_doc, _ = _add_document(
        repo,
        governance,
        "Contract X.pdf",
        parties="Acme Corp",
        expiry="2027-03-31",
    )
    build_knowledge_graph(finance_doc, finance, repo=repo, store=store)
    build_knowledge_graph(governance_doc, governance, repo=repo, store=store)
    assert len(store.named_entities(str(finance), "Organization", "acme corp")) == 1
    assert len(store.named_entities(str(governance), "Organization", "acme corp")) == 1
    assert store.cross_workspace_path_count() == 0


def test_resolve_entity_refuses_missing_workspace():
    store = InMemoryGraphStore()
    with pytest.raises(GraphBuildError):
        resolve_entity(
            None,  # type: ignore[arg-type]
            "Organization",
            "Acme Corp",
            document_id=uuid.uuid4(),
            source_chunk_id=uuid.uuid4(),
            store=store,
        )
    assert store.nodes == {}


def test_contradiction_between_contract_and_amendment():
    repo = InMemoryPipelineRepository()
    store = InMemoryGraphStore()
    workspace_id = uuid.uuid4()
    module_a = uuid.uuid4()
    module_b = uuid.uuid4()
    contract_id, _ = _add_document(
        repo,
        workspace_id,
        "Contract X.pdf",
        parties="Acme Corp",
        expiry="2027-03-31",
        group_id=module_a,
        page=3,
    )
    amendment_id, _ = _add_document(
        repo,
        workspace_id,
        "Amendment 2.pdf",
        parties="Acme Corp",
        expiry="2027-06-30",
        amends="Contract X",
        group_id=module_b,
        page=1,
    )
    build_knowledge_graph(contract_id, workspace_id, repo=repo, store=store)
    build_knowledge_graph(amendment_id, workspace_id, repo=repo, store=store)
    found = detect_contradictions(amendment_id, workspace_id, store=store)
    assert len(found) == 1
    assert {found[0].left_value, found[0].right_value} == {"2027-03-31", "2027-06-30"}
    assert {found[0].left_document_id, found[0].right_document_id} == {str(contract_id), str(amendment_id)}
    assert all(item.left_source_page and item.right_source_page for item in found)
    assert "CONTRADICTS" in {rel for rel, _start, _end in store.edges}

    module_a_scope = contradictions_in_scope(workspace_id, [contract_id], store=store)
    assert module_a_scope == []
    workspace_scope = contradictions_in_scope(workspace_id, [contract_id, amendment_id], store=store)
    assert len(workspace_scope) == 1
    assert workspace_scope[0].workspace_id == str(workspace_id)


def test_contradictions_never_cross_workspaces():
    repo = InMemoryPipelineRepository()
    store = InMemoryGraphStore()
    finance = uuid.uuid4()
    governance = uuid.uuid4()
    finance_doc, _ = _add_document(repo, finance, "Contract X.pdf", parties="Acme Corp", expiry="2027-03-31")
    governance_doc, _ = _add_document(
        repo,
        governance,
        "Contract X.pdf",
        parties="Acme Corp",
        expiry="2028-01-01",
    )
    build_knowledge_graph(finance_doc, finance, repo=repo, store=store)
    build_knowledge_graph(governance_doc, governance, repo=repo, store=store)
    detect_contradictions(finance_doc, finance, store=store)
    detect_contradictions(governance_doc, governance, store=store)
    assert store.cross_workspace_path_count() == 0
    assert not any(rel == "CONTRADICTS" for rel, _start, _end in store.edges)


def test_chunk_extraction_failure_skips_chunk_and_keeps_others():
    repo = InMemoryPipelineRepository()
    store = InMemoryGraphStore()
    workspace_id = uuid.uuid4()
    document_id = uuid.uuid4()
    good_chunk = uuid.uuid4()
    bad_chunk = uuid.uuid4()
    repo.add_document(
        DocumentRecord(
            id=document_id,
            file_name="Contract X.pdf",
            file_type="pdf",
            storage_path="workspace/x/original.pdf",
            processing_status="INDEXING",
            workspace_id=workspace_id,
            document_type="contract",
        )
    )
    repo.replace_chunks(
        document_id,
        [
            ChunkRecord(id=bad_chunk, document_id=document_id, section_id=None, page_number=1, chunk_text="bad", token_count=1),
            ChunkRecord(
                id=good_chunk,
                document_id=document_id,
                section_id=None,
                page_number=2,
                chunk_text="Parties: Acme Corp",
                token_count=3,
            ),
        ],
    )

    class Flaky(RulesKgExtractor):
        def extract(self, text, fields):
            if text == "bad":
                raise RuntimeError("llm failed")
            return super().extract(text, fields)

    build_knowledge_graph(document_id, workspace_id, repo=repo, extractor=Flaky(), store=store)
    assert len(store.named_entities(str(workspace_id), "Organization", "acme corp")) == 1


def test_workspace_mismatch_writes_nothing():
    repo, store, workspace_id, document_id, _chunk_id = _contract(
        file_name="Contract X.pdf",
        parties="Acme Corp",
        expiry="2027-03-31",
    )
    with pytest.raises(GraphBuildError):
        build_knowledge_graph(document_id, uuid.uuid4(), repo=repo, store=store)
    assert store.nodes == {}


def _contract(
    *,
    file_name: str,
    parties: str,
    expiry: str,
    page: int = 1,
    extra_text: str = "",
    amends: str | None = None,
    group_id: uuid.UUID | None = None,
    workspace_id: uuid.UUID | None = None,
):
    repo = InMemoryPipelineRepository()
    store = InMemoryGraphStore()
    workspace_id = workspace_id or uuid.uuid4()
    document_id, chunk_id = _add_document(
        repo,
        workspace_id,
        file_name,
        parties=parties,
        expiry=expiry,
        page=page,
        extra_text=extra_text,
        amends=amends,
        group_id=group_id,
    )
    return repo, store, workspace_id, document_id, chunk_id


def _add_document(
    repo: InMemoryPipelineRepository,
    workspace_id: uuid.UUID,
    file_name: str,
    *,
    parties: str,
    expiry: str,
    page: int = 1,
    extra_text: str = "",
    amends: str | None = None,
    group_id: uuid.UUID | None = None,
) -> tuple[uuid.UUID, uuid.UUID]:
    document_id = uuid.uuid4()
    chunk_id = uuid.uuid4()
    text = f"Parties: {parties}. Expiry Date: {expiry}. {extra_text}".strip()
    repo.add_document(
        DocumentRecord(
            id=document_id,
            file_name=file_name,
            file_type="pdf",
            storage_path=f"workspace/{workspace_id}/document/{document_id}/original.pdf",
            processing_status="INDEXING",
            workspace_id=workspace_id,
            group_id=group_id,
            document_type="contract",
        )
    )
    repo.replace_chunks(
        document_id,
        [
            ChunkRecord(
                id=chunk_id,
                document_id=document_id,
                section_id=None,
                page_number=page,
                chunk_text=text,
                token_count=20,
            )
        ],
    )
    fields = [
        _field(document_id, chunk_id, "Parties", parties, page),
        _field(document_id, chunk_id, "Expiry Date", expiry, page),
    ]
    if amends:
        fields.append(_field(document_id, chunk_id, "Amends", amends, page))
    repo.insert_extracted_fields(document_id, fields)
    return document_id, chunk_id


def _field(
    document_id: uuid.UUID,
    chunk_id: uuid.UUID,
    name: str,
    value: str,
    page: int,
) -> ExtractedFieldRecord:
    return ExtractedFieldRecord(
        id=uuid.uuid4(),
        document_id=document_id,
        field_name=name,
        field_category="universal",
        field_value=value,
        confidence=0.9,
        source_page=page,
        source_chunk_id=chunk_id,
        status="extracted",
    )
