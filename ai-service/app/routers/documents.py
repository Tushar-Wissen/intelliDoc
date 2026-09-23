from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from app.pipeline.orchestrator import process_document_task

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Internal"])


class ProcessDocumentRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    document_id: UUID = Field(alias="documentId")


class ProcessDocumentAccepted(BaseModel):
    accepted: bool = True
    documentId: UUID


@router.post(
    "/internal/ai/documents/process",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=ProcessDocumentAccepted,
)
def process_document(request: ProcessDocumentRequest) -> ProcessDocumentAccepted:
    try:
        process_document_task.delay(str(request.document_id))
    except Exception as exc:
        logger.exception("Failed to enqueue processing for documentId=%s", request.document_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to enqueue document processing.",
        ) from exc
    return ProcessDocumentAccepted(documentId=request.document_id)
