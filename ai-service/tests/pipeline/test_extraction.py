from __future__ import annotations

import uuid

from app.db.repository import ChunkRecord
from app.llm.client import set_llm_client
from app.pipeline.extraction import extract_type_specific_fields, extract_universal_fields
from app.pipeline.schemas.field_schemas import DocumentType
from tests.fakes import InMemoryPipelineRepository


def test_universal_extraction_service_agreement_fields():
    repo = InMemoryPipelineRepository()
    document_id = uuid.uuid4()
    chunk_id = uuid.uuid4()
    text = (
        "Signed Service Agreement\n"
        "Parties: Acme Corp, Beta Ltd\n"
        "Effective Date: 2026-01-01\n"
        "Reference: SA-2026-001\n"
        "Topics: services, confidentiality\n"
    )
    repo.chunks[document_id] = [
        ChunkRecord(
            id=chunk_id,
            document_id=document_id,
            section_id=None,
            page_number=1,
            chunk_text=text,
            token_count=80,
        )
    ]
    set_llm_client(None)
    results = extract_universal_fields(document_id, repo=repo)
    names = {item.field_name for item in results}
    assert "Effective Date" in names
    assert "Parties" in names
    effective = next(item for item in results if item.field_name == "Effective Date")
    assert effective.field_value == "2026-01-01"
    assert effective.confidence == 0.97
    assert effective.source_page == 1
    assert effective.source_chunk_id == chunk_id
    assert repo.extracted_fields[document_id]


def test_financial_report_type_specific_without_termination_terms():
    repo = InMemoryPipelineRepository()
    document_id = uuid.uuid4()
    chunk_id = uuid.uuid4()
    text = (
        "Annual Financial Report\n"
        "Revenue: $12,500,000.00\n"
        "EBITDA: $3,100,000.00\n"
        "Forecast Period: FY2027\n"
    )
    repo.chunks[document_id] = [
        ChunkRecord(
            id=chunk_id,
            document_id=document_id,
            section_id=None,
            page_number=2,
            chunk_text=text,
            token_count=60,
        )
    ]
    set_llm_client(None)
    results = extract_type_specific_fields(
        document_id, DocumentType.FINANCIAL_REPORT, repo=repo
    )
    names = {item.field_name for item in results}
    assert "Revenue" in names
    assert "EBITDA" in names
    assert "Termination Terms" not in names
