"""LLM prompt builders for Epic 3 classification and extraction."""

from __future__ import annotations

import uuid

from app.pipeline.schemas.field_schemas import DocumentType


def rules_classification_prompt(document_id: uuid.UUID, text: str) -> str:
    return (
        "Classify the document and produce topics.\n"
        "topics must be ordered by importance (most important first).\n"
        f"documentId={document_id}\n"
        f"---\n{text}"
    )


def summary_prompt(document_id: uuid.UUID, text: str) -> str:
    return (
        "Summarize the document in 2-4 sentences as JSON.\n"
        'Return JSON with exactly one key: "summary".\n'
        "summary must be a non-empty string describing the document purpose and key points.\n"
        "Do not echo documentId or include any other keys.\n"
        f"documentId={document_id}\n"
        f"---\n{text}"
    )


def universal_extraction_prompt(
    document_id: uuid.UUID,
    chunk_id: uuid.UUID,
    page: int,
    text: str,
) -> str:
    return (
        "Extract universal fields as JSON with provenance for each fact.\n"
        'Return JSON with key "fields" containing an array of objects.\n'
        "Each object must have keys: fieldName, fieldValue, confidence, sourcePage, sourceChunkId.\n"
        "confidence must be between 0.0 and 1.0.\n"
        "sourcePage must be the page number where the fact appears.\n"
        f"sourceChunkId must be exactly {chunk_id}.\n"
        f"documentId={document_id} chunkId={chunk_id} page={page}\n"
        f"---\n{text}"
    )


def type_specific_extraction_prompt(
    document_id: uuid.UUID,
    document_type: DocumentType,
    chunk_id: uuid.UUID,
    page: int,
    text: str,
) -> str:
    return (
        "Extract type-specific fields as JSON. Omit fields that do not apply.\n"
        'Return JSON with key "fields" containing an array of objects.\n'
        "Each object must have keys: fieldName, fieldValue, confidence, sourcePage, sourceChunkId.\n"
        "confidence must be between 0.0 and 1.0.\n"
        f"sourceChunkId must be exactly {chunk_id}.\n"
        f"documentId={document_id} documentType={document_type.value} "
        f"chunkId={chunk_id} page={page}\n"
        f"---\n{text}"
    )
