from __future__ import annotations

import uuid

import pytest

from app.config import settings
from app.db.repository import ChunkRecord
from app.llm.client import CallableLlmClient, LlmError, set_rules_llm_client, set_summary_llm_client
from app.pipeline.classification import ClassificationError, classify_and_summarize
from app.pipeline.schemas.field_schemas import ClassificationResultSchema, DocumentType, SummaryResultSchema
from tests.fakes import InMemoryPipelineRepository
from tests.fixtures import CONTRACT_HEADINGS, contract_paragraph


def test_classify_contract_sets_type_confidence_topics_and_summary():
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
    set_rules_llm_client(None)
    set_summary_llm_client(
        CallableLlmClient(
            lambda _prompt, schema: {"summary": "LLM summary of the master services agreement."}
            if schema is SummaryResultSchema
            else None
        )
    )
    try:
        result = classify_and_summarize(document_id, repo=repo)
        assert result.document_type == DocumentType.CONTRACT
        assert result.confidence == 0.93
        assert result.topics
        assert result.summary == "LLM summary of the master services agreement."
        stored = repo.classification[document_id]
        assert stored.document_type == "contract"
        assert stored.classification_confidence == 0.93
        assert stored.overview.startswith("[")
    finally:
        set_rules_llm_client(None)
        set_summary_llm_client(None)


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
    set_rules_llm_client(None)
    set_summary_llm_client(None)
    try:
        result = classify_and_summarize(document_id, repo=repo)
        assert result.confidence < settings.classification_confidence_threshold
        assert result.low_confidence is True
    finally:
        set_rules_llm_client(None)
        set_summary_llm_client(None)


def test_invalid_rules_type_fails():
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

    def broken(_prompt, _schema):
        return {
            "documentType": "invoice",
            "confidence": 0.9,
            "topics": ["Billing"],
            "summary": "y",
        }

    set_rules_llm_client(CallableLlmClient(broken))
    set_summary_llm_client(None)
    try:
        with pytest.raises(Exception):
            classify_and_summarize(document_id, repo=repo)
    finally:
        set_rules_llm_client(None)
        set_summary_llm_client(None)


def test_summary_llm_timeout_retries_then_fails():
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

    def timeout(_prompt, schema):
        if schema is SummaryResultSchema:
            calls["count"] += 1
            raise LlmError("The read operation timed out")
        raise AssertionError(schema)

    set_rules_llm_client(None)
    set_summary_llm_client(CallableLlmClient(timeout))
    try:
        with pytest.raises(ClassificationError, match="read operation timed out"):
            classify_and_summarize(document_id, repo=repo)
        assert calls["count"] == 2
    finally:
        set_rules_llm_client(None)
        set_summary_llm_client(None)
