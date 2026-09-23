"""Story 3.1 — document classification and overview/summary."""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass

from app.config import settings
from app.db.repository import PipelineRepository, get_repository
from app.llm.client import LlmError, get_llm_client, with_retry
from app.pipeline import extraction
from app.pipeline.schemas.field_schemas import ClassificationResultSchema, DocumentType

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ClassificationResult:
    document_type: DocumentType
    confidence: float
    overview: str
    summary: str
    low_confidence: bool


class ClassificationError(Exception):
    pass


def classify_and_extract(
    document_id: uuid.UUID,
    *,
    repo: PipelineRepository | None = None,
) -> ClassificationResult:
    """Orchestrator entry: classification then universal and type-specific extraction."""
    repo = repo or get_repository()
    repo.clear_extracted_fields(document_id)
    result = classify_and_summarize(document_id, repo=repo)
    extraction.extract_universal_fields(document_id, repo=repo)
    extraction.extract_type_specific_fields(document_id, result.document_type, repo=repo)
    return result


def classify_and_summarize(
    document_id: uuid.UUID,
    *,
    repo: PipelineRepository | None = None,
) -> ClassificationResult:
    repo = repo or get_repository()
    chunks = repo.list_chunks(document_id)
    if not chunks:
        raise ClassificationError("No chunks available for classification")

    text = _classification_text(chunks)
    prompt = (
        "Classify the document and produce overview and summary as JSON.\n"
        f"documentId={document_id}\n"
        f"---\n{text}"
    )
    client = get_llm_client()

    def _call() -> ClassificationResultSchema:
        try:
            return client.complete_json(prompt, ClassificationResultSchema)
        except LlmError as exc:
            raise ClassificationError(str(exc)) from exc

    try:
        parsed = with_retry(_call, retries=1)
    except Exception as exc:
        raise ClassificationError(str(exc)) from exc

    low_confidence = parsed.confidence < settings.classification_confidence_threshold
    if low_confidence:
        logger.warning(
            "Low classification confidence documentId=%s type=%s confidence=%s threshold=%s",
            document_id,
            parsed.document_type.value,
            parsed.confidence,
            settings.classification_confidence_threshold,
        )

    result = ClassificationResult(
        document_type=parsed.document_type,
        confidence=parsed.confidence,
        overview=parsed.overview,
        summary=parsed.summary,
        low_confidence=low_confidence,
    )
    repo.update_classification(
        document_id,
        document_type=result.document_type.value,
        classification_confidence=result.confidence,
        overview=result.overview,
        summary=result.summary,
    )
    logger.info(
        "Classification complete documentId=%s type=%s confidence=%s lowConfidence=%s",
        document_id,
        result.document_type.value,
        result.confidence,
        result.low_confidence,
    )
    return result


def _classification_text(chunks) -> str:
    ordered = sorted(chunks, key=lambda chunk: (chunk.page_number or 0, chunk.id.int))
    limit = settings.llm_max_context_chunks
    selected = ordered[:limit]
    parts = []
    for chunk in selected:
        page = chunk.page_number or 1
        parts.append(f"[page={page} chunkId={chunk.id}]\n{chunk.chunk_text}")
    return "\n\n".join(parts)
