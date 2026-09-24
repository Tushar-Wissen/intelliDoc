"""Two-workspace fixture for Epic 6 isolation tests."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.db.repository import ChunkRecord, DocumentRecord, SectionRecord
from app.pipeline.kg import detect_contradictions
from app.retrieval.config import RetrievalConfig
from tests.fakes import InMemoryGraphStore, InMemoryPipelineRepository, OverlapEmbeddingModel

FINANCE = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
GOVERNANCE = uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
MODULE_A = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01")
MODULE_B = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02")
MODULE_GOV = uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01")
DOC_A = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11")
DOC_B = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa22")
DOC_INDEXING = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa33")
DOC_GOV = uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb11")

CHUNK_IDENTIFIER = uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccc01")
CHUNK_A_EXPIRY = uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccc02")
CHUNK_A_TERMS = uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccc03")
CHUNK_A_SIGN = uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccc04")
CHUNK_B_EXPIRY = uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccc05")
CHUNK_B_SENTINEL = uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccc06")
CHUNK_INDEX = uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccc07")
CHUNK_GOV = uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccc08")
SECTION_A = uuid.UUID("dddddddd-dddd-dddd-dddd-dddddddddd01")
SECTION_B = uuid.UUID("dddddddd-dddd-dddd-dddd-dddddddddd02")


@dataclass
class RetrievalWorld:
    repo: InMemoryPipelineRepository
    store: InMemoryGraphStore
    embedder: OverlapEmbeddingModel


def build_world() -> RetrievalWorld:
    repo = InMemoryPipelineRepository()
    repo.add_document(_document(DOC_A, FINANCE, MODULE_A, "Contract-A.pdf"))
    repo.add_document(_document(DOC_B, FINANCE, MODULE_B, "Amendment-B.pdf"))
    repo.add_document(_document(DOC_INDEXING, FINANCE, MODULE_A, "Draft.pdf", status="INDEXING"))
    repo.add_document(_document(DOC_GOV, GOVERNANCE, MODULE_GOV, "Gov-Policy.pdf"))
    repo.replace_sections(
        DOC_A,
        [SectionRecord(SECTION_A, DOC_A, None, "Expiry", 1, 1)],
    )
    repo.replace_sections(
        DOC_B,
        [SectionRecord(SECTION_B, DOC_B, None, "Amendment", 1, 2)],
    )
    chunks = [
        _chunk(CHUNK_IDENTIFIER, DOC_A, SECTION_A, "Ref SA-2026-014"),
        _chunk(CHUNK_A_EXPIRY, DOC_A, SECTION_A, "Expiry date for Acme Corp is 2027-03-31."),
        _chunk(CHUNK_A_TERMS, DOC_A, SECTION_A, "Termination clauses require thirty days written notice."),
        _chunk(
            CHUNK_A_SIGN,
            DOC_A,
            SECTION_A,
            "Acme Corp signed the master services agreement. Obligations include audit support.",
        ),
        _chunk(uuid.uuid4(), DOC_A, SECTION_A, "Finance contract filler paragraph about delivery."),
        _chunk(uuid.uuid4(), DOC_A, SECTION_A, "Finance contract filler paragraph about payment."),
        _chunk(CHUNK_B_EXPIRY, DOC_B, SECTION_B, "Expiry date 2027-06-30 applies to the amendment."),
        _chunk(CHUNK_B_SENTINEL, DOC_B, SECTION_B, "MODULE_B_UNIQUE_SENTINEL appears only in module B."),
        *[
            _chunk(
                uuid.uuid4(),
                DOC_B,
                SECTION_B,
                f"termination clauses obligations key differences amendment text volume {index}",
            )
            for index in range(8)
        ],
        _chunk(
            CHUNK_INDEX,
            DOC_INDEXING,
            None,
            "INDEXING_SENTINEL termination Acme Corp SA-2026-014",
        ),
        _chunk(CHUNK_GOV, DOC_GOV, None, "GOVERNANCE_SENTINEL Acme Corp policy expiry date 2028-01-01."),
        _chunk(uuid.uuid4(), DOC_GOV, None, "Governance filler paragraph for the contracts module."),
    ]
    embedder = OverlapEmbeddingModel()
    vectors = embedder.encode([chunk.chunk_text for chunk in chunks])
    for chunk, vector in zip(chunks, vectors):
        chunk.embedding = vector
    by_document: dict[uuid.UUID, list[ChunkRecord]] = {}
    for chunk in chunks:
        by_document.setdefault(chunk.document_id, []).append(chunk)
    for document_id, document_chunks in by_document.items():
        repo.replace_chunks(document_id, document_chunks)

    store = InMemoryGraphStore()
    doc_a = store.merge_document(
        document_id=str(DOC_A),
        workspace_id=str(FINANCE),
        group_id=str(MODULE_A),
        title="Contract-A.pdf",
        document_type="contract",
        source_chunk_id=str(CHUNK_A_SIGN),
        source_page=1,
    )
    doc_b = store.merge_document(
        document_id=str(DOC_B),
        workspace_id=str(FINANCE),
        group_id=str(MODULE_B),
        title="Amendment-B.pdf",
        document_type="contract",
        source_chunk_id=str(CHUNK_B_SENTINEL),
        source_page=1,
    )
    store.merge_document(
        document_id=str(DOC_GOV),
        workspace_id=str(GOVERNANCE),
        group_id=str(MODULE_GOV),
        title="Gov-Policy.pdf",
        document_type="policy",
        source_chunk_id=str(CHUNK_GOV),
        source_page=1,
    )
    fact_a = store.merge_date_fact(
        workspace_id=str(FINANCE),
        document_id=str(DOC_A),
        label="expiry date",
        value="2027-03-31",
        source_chunk_id=str(CHUNK_A_EXPIRY),
        source_page=1,
    )
    fact_b = store.merge_date_fact(
        workspace_id=str(FINANCE),
        document_id=str(DOC_B),
        label="expiry date",
        value="2027-06-30",
        source_chunk_id=str(CHUNK_B_EXPIRY),
        source_page=1,
    )
    leak = store.merge_date_fact(
        workspace_id=str(FINANCE),
        document_id=str(DOC_A),
        label="leak marker",
        value="LEAK_VALUE",
        source_chunk_id=str(CHUNK_B_SENTINEL),
        source_page=2,
    )
    store.merge_relationship(
        workspace_id=str(FINANCE), rel_type="EXPIRES_ON", start_id=doc_a, end_id=fact_a
    )
    store.merge_relationship(
        workspace_id=str(FINANCE), rel_type="EXPIRES_ON", start_id=doc_b, end_id=fact_b
    )
    store.merge_relationship(
        workspace_id=str(FINANCE), rel_type="EXPIRES_ON", start_id=doc_a, end_id=leak
    )
    store.merge_relationship(
        workspace_id=str(FINANCE), rel_type="AMENDS", start_id=doc_b, end_id=doc_a
    )
    acme_finance, _created = store.resolve_named_entity(
        workspace_id=str(FINANCE),
        entity_type="Organization",
        name="Acme Corp",
        document_id=str(DOC_B),
        source_chunk_id=str(CHUNK_B_SENTINEL),
        source_page=1,
    )
    store.resolve_named_entity(
        workspace_id=str(FINANCE),
        entity_type="Organization",
        name="Acme Corp",
        document_id=str(DOC_A),
        source_chunk_id=str(CHUNK_A_SIGN),
        source_page=1,
    )
    store.resolve_named_entity(
        workspace_id=str(GOVERNANCE),
        entity_type="Organization",
        name="Acme Corp",
        document_id=str(DOC_GOV),
        source_chunk_id=str(CHUNK_GOV),
        source_page=1,
    )
    store.merge_relationship(
        workspace_id=str(FINANCE), rel_type="SIGNED", start_id=acme_finance, end_id=doc_a
    )
    store.merge_relationship(
        workspace_id=str(FINANCE), rel_type="MENTIONS", start_id=doc_b, end_id=acme_finance
    )
    gov_doc = next(
        node.node_id
        for node in store.nodes.values()
        if node.label == "Document" and node.properties.get("document_id") == str(DOC_GOV)
    )
    gov_acme = next(
        node.node_id
        for node in store.nodes.values()
        if node.label == "Organization" and node.properties.get("workspace_id") == str(GOVERNANCE)
    )
    store.merge_relationship(
        workspace_id=str(GOVERNANCE), rel_type="MENTIONS", start_id=gov_doc, end_id=gov_acme
    )
    detect_contradictions(DOC_B, FINANCE, store=store)
    return RetrievalWorld(repo=repo, store=store, embedder=embedder)


def fast_config() -> RetrievalConfig:
    return RetrievalConfig(db_timeout_ms=5000, graph_timeout_ms=5000, rerank_timeout_ms=5000)


def _document(document_id, workspace_id, group_id, file_name, status="READY") -> DocumentRecord:
    return DocumentRecord(
        id=document_id,
        file_name=file_name,
        file_type="pdf",
        storage_path=f"workspace/{workspace_id}/document/{document_id}/original.pdf",
        processing_status=status,
        workspace_id=workspace_id,
        group_id=group_id,
    )


def _chunk(chunk_id, document_id, section_id, text) -> ChunkRecord:
    return ChunkRecord(
        id=chunk_id,
        document_id=document_id,
        section_id=section_id,
        page_number=1,
        chunk_text=text,
        token_count=max(1, len(text.split())),
        embedding=None,
    )
