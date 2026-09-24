from __future__ import annotations

import uuid

from app.pipeline.embedding_model import set_embedding_model
from app.pipeline.indexing import IndexingError
from app.pipeline.kg import GraphBuildError, set_graph_store
from app.pipeline.orchestrator import process_document
from app.pipeline.parsing import ParseError
from app.pipeline.types import ParsedDocument, ParsedPage, ParsedSection
from tests.fakes import FakeMinio, InMemoryGraphStore, InMemoryPipelineRepository, OverlapEmbeddingModel
from tests.fixtures import CONTRACT_HEADINGS, contract_paragraph
from app.db.repository import DocumentRecord, set_repository
from app.storage.minio_client import set_minio


def test_orchestrator_indexes_chunks_and_marks_ready(monkeypatch):
    repo = InMemoryPipelineRepository()
    document_id = uuid.uuid4()
    workspace_id = uuid.uuid4()
    storage_path = f"workspace/w/document/{document_id}/original.pdf"
    repo.add_document(
        DocumentRecord(
            id=document_id,
            file_name="contract.pdf",
            file_type="pdf",
            storage_path=storage_path,
            processing_status="UPLOADED",
            workspace_id=workspace_id,
        )
    )
    pages = [
        ParsedPage(
            page_number=i,
            raw_text=f"{heading}\n\n{contract_paragraph(heading) * 8}",
            headings=[heading],
        )
        for i, heading in enumerate(CONTRACT_HEADINGS, start=1)
    ]
    parsed = ParsedDocument(
        pages=pages,
        sections=[
            ParsedSection(heading=heading, start_page=i, end_page=i)
            for i, heading in enumerate(CONTRACT_HEADINGS, start=1)
        ],
        file_type="pdf",
    )
    minio = FakeMinio(objects={storage_path: b"pdf-bytes"})
    set_repository(repo)
    set_minio(minio)
    graph = InMemoryGraphStore()
    set_graph_store(graph)

    class StubParser:
        def parse(self, file_bytes, file_type):
            return parsed

    monkeypatch.setattr("app.pipeline.parsing.CascadingParser", StubParser)
    set_embedding_model(OverlapEmbeddingModel())
    try:
        process_document(document_id, repo=repo)
    finally:
        set_repository(None)
        set_minio(None)
        set_embedding_model(None)
        set_graph_store(None)

    assert repo.get_document(document_id).processing_status == "READY"
    assert repo.jobs[document_id].status == "COMPLETED"
    assert graph.counts_for_document(str(document_id), str(workspace_id))[0] >= 1
    assert repo.classification[document_id].document_type == "contract"
    assert repo.extracted_fields[document_id]
    assert len(repo.list_pages(document_id)) == 10
    chunks = repo.list_chunks(document_id)
    assert chunks
    assert all(chunk.embedding is not None for chunk in chunks if chunk.chunk_text.strip())


def test_orchestrator_parse_failure_sets_failed_and_error_message(monkeypatch):
    repo = InMemoryPipelineRepository()
    document_id = uuid.uuid4()
    storage_path = "workspace/w/document/d/original.pdf"
    repo.add_document(
        DocumentRecord(
            id=document_id,
            file_name="bad.pdf",
            file_type="pdf",
            storage_path=storage_path,
            processing_status="UPLOADED",
        )
    )
    set_repository(repo)
    set_minio(FakeMinio(objects={storage_path: b"nope"}))
    class StubParser:
        def parse(self, file_bytes, file_type):
            raise ParseError("corrupt")

    monkeypatch.setattr("app.pipeline.parsing.CascadingParser", StubParser)
    try:
        process_document(document_id, repo=repo)
    finally:
        set_repository(None)
        set_minio(None)
    assert repo.get_document(document_id).processing_status == "FAILED"
    assert repo.jobs[document_id].status == "FAILED"
    assert "could not be read" in (repo.jobs[document_id].error_message or "")
    assert "Traceback" not in (repo.jobs[document_id].error_message or "")


def test_orchestrator_indexing_failure_sets_failed(monkeypatch):
    repo = InMemoryPipelineRepository()
    document_id = uuid.uuid4()
    storage_path = f"workspace/w/document/{document_id}/original.pdf"
    repo.add_document(
        DocumentRecord(
            id=document_id,
            file_name="contract.pdf",
            file_type="pdf",
            storage_path=storage_path,
            processing_status="UPLOADED",
        )
    )
    pages = [
        ParsedPage(
            page_number=1,
            raw_text=f"Master Services Agreement\n\n{contract_paragraph('Master Services Agreement') * 8}",
            headings=["Master Services Agreement"],
        )
    ]
    parsed = ParsedDocument(
        pages=pages,
        sections=[ParsedSection(heading="Master Services Agreement", start_page=1, end_page=1)],
        file_type="pdf",
    )
    set_repository(repo)
    set_minio(FakeMinio(objects={storage_path: b"pdf-bytes"}))

    class StubParser:
        def parse(self, file_bytes, file_type):
            return parsed

    def fail_index(document_id, **kwargs):
        raise IndexingError("batch failed")

    monkeypatch.setattr("app.pipeline.parsing.CascadingParser", StubParser)
    monkeypatch.setattr("app.pipeline.orchestrator.indexing.generate_embeddings", fail_index)
    try:
        process_document(document_id, repo=repo)
    finally:
        set_repository(None)
        set_minio(None)

    assert repo.get_document(document_id).processing_status == "FAILED"
    assert repo.jobs[document_id].status == "FAILED"
    assert repo.jobs[document_id].error_message == "The document could not be indexed for search."


def test_orchestrator_graph_failure_sets_failed(monkeypatch):
    repo = InMemoryPipelineRepository()
    document_id = uuid.uuid4()
    storage_path = f"workspace/w/document/{document_id}/original.pdf"
    repo.add_document(
        DocumentRecord(
            id=document_id,
            file_name="contract.pdf",
            file_type="pdf",
            storage_path=storage_path,
            processing_status="UPLOADED",
            workspace_id=uuid.uuid4(),
        )
    )
    pages = [
        ParsedPage(
            page_number=1,
            raw_text=f"Master Services Agreement\n\n{contract_paragraph('Master Services Agreement') * 8}",
            headings=["Master Services Agreement"],
        )
    ]
    parsed = ParsedDocument(
        pages=pages,
        sections=[ParsedSection(heading="Master Services Agreement", start_page=1, end_page=1)],
        file_type="pdf",
    )
    set_repository(repo)
    set_minio(FakeMinio(objects={storage_path: b"pdf-bytes"}))
    set_embedding_model(OverlapEmbeddingModel())

    class StubParser:
        def parse(self, file_bytes, file_type):
            return parsed

    class BoomStore(InMemoryGraphStore):
        def merge_document(self, **kwargs):
            raise GraphBuildError("neo4j down")

    monkeypatch.setattr("app.pipeline.parsing.CascadingParser", StubParser)
    set_graph_store(BoomStore())
    try:
        process_document(document_id, repo=repo)
    finally:
        set_repository(None)
        set_minio(None)
        set_embedding_model(None)
        set_graph_store(None)

    assert repo.get_document(document_id).processing_status == "FAILED"
    assert repo.jobs[document_id].error_message == "The document knowledge graph could not be built."
