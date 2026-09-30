"""Story 3.1 — document classification, topics overview, and summary."""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass

from pydantic import ValidationError

from app.config import settings
from app.db.repository import PipelineRepository, get_repository
from app.llm.client import LlmError, get_rules_llm_client, get_summary_llm_client, with_retry
from app.pipeline import extraction
from app.pipeline.prompts import rules_classification_prompt, summary_prompt
from app.pipeline.schemas.field_schemas import (
    ClassificationResultSchema,
    DocumentType,
    SummaryResultSchema,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ClassificationResult:
    document_type: DocumentType
    confidence: float
    topics: list[str]
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
    rules_client = get_rules_llm_client()
    classification_prompt = rules_classification_prompt(document_id, text)

    def _classify() -> ClassificationResultSchema:
        return rules_client.complete_json(classification_prompt, ClassificationResultSchema)

    try:
        classified = _classify()
    except (LlmError, ValidationError) as exc:
        raise ClassificationError(str(exc)) from exc

    summary_client = get_summary_llm_client()
    summary_prompt_text = summary_prompt(document_id, text)

    def _summarize() -> SummaryResultSchema:
        return summary_client.complete_json(summary_prompt_text, SummaryResultSchema)

    try:
        summarized = with_retry(_summarize, retries=1)
    except (LlmError, ValidationError) as exc:
        raise ClassificationError(str(exc)) from exc

    low_confidence = classified.confidence < settings.classification_confidence_threshold
    if low_confidence:
        logger.warning(
            "Low classification confidence documentId=%s type=%s confidence=%s threshold=%s",
            document_id,
            classified.document_type.value,
            classified.confidence,
            settings.classification_confidence_threshold,
        )

    result = ClassificationResult(
        document_type=classified.document_type,
        confidence=classified.confidence,
        topics=classified.topics,
        summary=summarized.summary,
        low_confidence=low_confidence,
    )
    repo.update_classification(
        document_id,
        document_type=result.document_type.value,
        classification_confidence=result.confidence,
        overview=_topics_to_overview(result.topics),
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


def _topics_to_overview(topics: list[str]) -> str:
    cleaned = [topic.strip() for topic in topics if topic and topic.strip()]
    return json.dumps(cleaned)


def _classification_text(chunks) -> str:
    ordered = sorted(chunks, key=lambda chunk: (chunk.page_number or 0, chunk.id.int))
    limit = settings.llm_max_context_chunks
    selected = ordered[:limit]
    parts = []
    for chunk in selected:
        page = chunk.page_number or 1
        parts.append(f"[page={page} chunkId={chunk.id}]\n{chunk.chunk_text}")
    return "\n\n".join(parts)
