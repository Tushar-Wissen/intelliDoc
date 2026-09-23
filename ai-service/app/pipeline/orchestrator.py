"""Ingestion orchestrator: parse → OCR → chunk → extract → index.

READY stays unset. Epic 4 plan §11 requires overview, fields, embeddings, and
the Epic 5 knowledge graph before READY. The graph stage is not in this
service yet, so a successful run stops at INDEXING with the job still running.
"""

from __future__ import annotations

import logging
import time
import uuid

from app.celery_app import celery_app
from app.db.repository import EXTRACTING, FAILED, INDEXING, PARSING, PipelineRepository, get_repository
from app.pipeline import chunking, indexing, ocr, parsing
from app.pipeline.classification import classify_and_extract
from app.pipeline.chunking import ChunkingError
from app.pipeline.indexing import IndexingError
from app.pipeline.parsing import ParseError

logger = logging.getLogger(__name__)

_USER_SAFE = {
    ParseError: "The document could not be read. The file may be corrupt or in an unsupported format.",
    ChunkingError: "The document produced no searchable text chunks.",
    IndexingError: "The document could not be indexed for search.",
}


@celery_app.task(name="app.pipeline.orchestrator.process_document")
def process_document_task(document_id: str) -> None:
    process_document(uuid.UUID(document_id))


def process_document(
    document_id: uuid.UUID,
    *,
    repo: PipelineRepository | None = None,
) -> None:
    repo = repo or get_repository()
    repo.set_processing_status(document_id, PARSING)
    repo.mark_job_running(document_id)
    try:
        _run_stage("parsing", document_id, lambda: parsing.parse_document(document_id, repo=repo))
        _run_stage("ocr", document_id, lambda: ocr.detect_and_run(document_id, repo=repo))
        _run_stage("chunking", document_id, lambda: chunking.chunk_document(document_id, repo=repo))
        repo.set_processing_status(document_id, EXTRACTING)
        _run_stage(
            "classification",
            document_id,
            lambda: classify_and_extract(document_id, repo=repo),
        )
        repo.set_processing_status(document_id, INDEXING)
        _run_stage(
            "indexing",
            document_id,
            lambda: indexing.generate_embeddings(document_id, repo=repo),
        )
        logger.info(
            "Indexing complete documentId=%s; READY deferred until knowledge-graph stage (Epic 5)",
            document_id,
        )
    except Exception as exc:
        logger.exception("Pipeline failed documentId=%s", document_id)
        repo.set_processing_status(document_id, FAILED)
        repo.mark_job_failed(document_id, _user_safe_message(exc))


def _run_stage(name: str, document_id: uuid.UUID, fn) -> None:
    started = time.perf_counter()
    fn()
    duration_ms = int((time.perf_counter() - started) * 1000)
    logger.info("Stage %s completed documentId=%s durationMs=%s", name, document_id, duration_ms)


def _user_safe_message(exc: Exception) -> str:
    for error_type, message in _USER_SAFE.items():
        if isinstance(exc, error_type):
            return message
    return "Document processing failed."
