"""Stories 3.2–3.3 — universal and type-specific field extraction."""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass

from app.db.repository import ExtractedFieldRecord, PipelineRepository, get_repository
from app.llm.client import LlmError, get_llm_client, with_retry
from app.pipeline.schemas.field_schemas import (
    DocumentType,
    ProvenanceField,
    TypeSpecificExtractionSchema,
    UniversalExtractionSchema,
    type_specific_category,
    validate_provenance_fields,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class FieldResult:
    field_name: str
    field_category: str
    field_value: str
    confidence: float
    source_page: int
    source_chunk_id: uuid.UUID


class ExtractionError(Exception):
    pass


def extract_universal_fields(
    document_id: uuid.UUID,
    *,
    repo: PipelineRepository | None = None,
) -> list[FieldResult]:
    repo = repo or get_repository()
    client = get_llm_client()
    collected: list[ProvenanceField] = []
    for chunk in repo.list_chunks(document_id):
        page = chunk.page_number or 1
        prompt = (
            "Extract universal fields as JSON with provenance for each fact.\n"
            f"documentId={document_id} chunkId={chunk.id} page={page}\n"
            f"---\n{chunk.chunk_text}"
        )

        def _call() -> UniversalExtractionSchema:
            try:
                parsed = client.complete_json(prompt, UniversalExtractionSchema)
            except LlmError as exc:
                raise ExtractionError(str(exc)) from exc
            return parsed

        try:
            parsed = with_retry(_call, retries=1)
        except Exception as exc:
            raise ExtractionError(str(exc)) from exc
        for field in validate_provenance_fields(parsed.fields):
            if field.source_chunk_id != chunk.id:
                field = field.model_copy(update={"sourceChunkId": chunk.id})
            if field.source_page != page:
                field = field.model_copy(update={"sourcePage": page})
            collected.append(field)

    results = _dedupe_fields(
        [
            FieldResult(
                field_name=item.field_name,
                field_category="universal",
                field_value=item.field_value,
                confidence=item.confidence,
                source_page=item.source_page,
                source_chunk_id=item.source_chunk_id,
            )
            for item in collected
        ]
    )
    repo.insert_extracted_fields(document_id, _to_records(document_id, results))
    if results:
        avg_conf = sum(item.confidence for item in results) / len(results)
        logger.info(
            "Universal extraction documentId=%s fieldCount=%s avgConfidence=%.3f",
            document_id,
            len(results),
            avg_conf,
        )
    return results


def extract_type_specific_fields(
    document_id: uuid.UUID,
    document_type: DocumentType | str,
    *,
    repo: PipelineRepository | None = None,
) -> list[FieldResult]:
    repo = repo or get_repository()
    if isinstance(document_type, str):
        try:
            document_type = DocumentType(document_type)
        except ValueError:
            document_type = DocumentType.OTHER

    category = type_specific_category(document_type)
    client = get_llm_client()
    collected: list[ProvenanceField] = []
    for chunk in repo.list_chunks(document_id):
        page = chunk.page_number or 1
        prompt = (
            "Extract type-specific fields as JSON. Omit fields that do not apply.\n"
            f"documentId={document_id} documentType={document_type.value} "
            f"chunkId={chunk.id} page={page}\n"
            f"---\n{chunk.chunk_text}"
        )

        def _call() -> TypeSpecificExtractionSchema:
            try:
                return client.complete_json(prompt, TypeSpecificExtractionSchema)
            except LlmError as exc:
                raise ExtractionError(str(exc)) from exc

        try:
            parsed = with_retry(_call, retries=1)
        except Exception as exc:
            raise ExtractionError(str(exc)) from exc
        for field in validate_provenance_fields(parsed.fields):
            if field.source_chunk_id != chunk.id:
                field = field.model_copy(update={"sourceChunkId": chunk.id})
            collected.append(field)

    results = _dedupe_fields(
        [
            FieldResult(
                field_name=item.field_name,
                field_category=category,
                field_value=item.field_value,
                confidence=item.confidence,
                source_page=item.source_page,
                source_chunk_id=item.source_chunk_id,
            )
            for item in collected
        ]
    )
    repo.insert_extracted_fields(document_id, _to_records(document_id, results))
    if results:
        avg_conf = sum(item.confidence for item in results) / len(results)
        logger.info(
            "Type-specific extraction documentId=%s type=%s fieldCount=%s avgConfidence=%.3f",
            document_id,
            document_type.value,
            len(results),
            avg_conf,
        )
    return results


def _to_records(document_id: uuid.UUID, results: list[FieldResult]) -> list[ExtractedFieldRecord]:
    return [
        ExtractedFieldRecord(
            id=uuid.uuid4(),
            document_id=document_id,
            field_name=item.field_name,
            field_category=item.field_category,
            field_value=item.field_value,
            confidence=item.confidence,
            source_page=item.source_page,
            source_chunk_id=item.source_chunk_id,
            status="AI_GENERATED",
        )
        for item in results
    ]


def _dedupe_fields(fields: list[FieldResult]) -> list[FieldResult]:
    seen: set[tuple[str, str, str]] = set()
    unique: list[FieldResult] = []
    for item in fields:
        key = (item.field_category, item.field_name.lower(), item.field_value.strip().lower())
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique
