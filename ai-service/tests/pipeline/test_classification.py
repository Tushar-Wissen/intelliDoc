from __future__ import annotations

import uuid

import pytest

from app.config import settings
from app.db.repository import ChunkRecord
from app.llm.client import CallableLlmClient, set_llm_client
from app.pipeline.classification import classify_and_summarize
from app.pipeline.schemas.field_schemas import ClassificationResultSchema, DocumentType
from tests.fakes import InMemoryPipelineRepository
from tests.fixtures import CONTRACT_HEADINGS, contract_paragraph


def test_classify_contract_sets_type_confidence_overview_summary():
    repo = InMemoryPipelineRepository()
    document_id = uuid.uuid4()
    chunk_id = uuid.uuid4()
    text = (
        "Master Services Agreement\n"
        "Parties: Acme Corp, Beta Ltd\n"
        "Effective Date: 2026-01-01\n"
        f"{contract_paragraph(CONTRACT_HEADINGS[0])}"
    )
    repo.chunks[document_id] = [
        ChunkRecord(
            id=chunk_id,
            document_id=document_id,
            section_id=None,
            page_number=1,
            chunk_text=text,
            token_count=120,
        )
    ]
    set_llm_client(None)
    result = classify_and_summarize(document_id, repo=repo)
    assert result.document_type == DocumentType.CONTRACT
    assert result.confidence == 0.93
    assert result.overview
    assert result.summary
    stored = repo.classification[document_id]
    assert stored.document_type == "contract"
    assert stored.classification_confidence == 0.93


def test_low_confidence_flagged_for_ambiguous_document():
    repo = InMemoryPipelineRepository()
    document_id = uuid.uuid4()
    repo.chunks[document_id] = [
        ChunkRecord(
            id=uuid.uuid4(),
            document_id=document_id,
            section_id=None,
            page_number=1,
            chunk_text="ambiguous",
            token_count=5,
        )
    ]
    set_llm_client(None)
    result = classify_and_summarize(document_id, repo=repo)
    assert result.confidence < settings.classification_confidence_threshold
    assert result.low_confidence is True


def test_invalid_llm_type_retries_then_fails():
    repo = InMemoryPipelineRepository()
    document_id = uuid.uuid4()
    repo.chunks[document_id] = [
        ChunkRecord(
            id=uuid.uuid4(),
            document_id=document_id,
            section_id=None,
            page_number=1,
            chunk_text="Master Services Agreement",
            token_count=10,
        )
    ]
    calls = {"count": 0}

    def broken(_prompt, _schema):
        calls["count"] += 1
        return {
            "documentType": "invoice",
            "confidence": 0.9,
            "overview": "x",
            "summary": "y",
        }

    set_llm_client(CallableLlmClient(broken))
    try:
        with pytest.raises(Exception):
            classify_and_summarize(document_id, repo=repo)
        assert calls["count"] == 2
    finally:
        set_llm_client(None)
