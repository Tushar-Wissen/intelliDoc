"""Internal FastAPI router for answer generation & verification (POST /internal/ai/chat/answer)."""

from __future__ import annotations

import logging
import uuid
from typing import Any, List, Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.generation.answer_generation_service import AnswerGenerationService
from app.generation.model_provider.base import ProviderError
from app.generation.not_found_handler import NotFoundHandler
from app.verification.claim_verification_service import ClaimVerificationService
from app.retrieval.schemas import AnswerMode, ConversationTurn, RetrievalRequest, ScopeType
from app.retrieval.service import RetrievalService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/internal/ai/chat", tags=["Internal Chat Answer"])


# Request DTO
class ChatAnswerRequest(BaseModel):
    sessionId: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4)
    workspaceId: uuid.UUID
    question: str = Field(..., min_length=1)
    resolvedDocumentIds: List[uuid.UUID] = Field(default_factory=list)
    scopeType: ScopeType = ScopeType.DOCUMENTS
    mode: AnswerMode = AnswerMode.RETRIEVAL_PLUS_GRAPH
    conversationContext: List[ConversationTurn] = Field(default_factory=list)
    requestId: Optional[str] = Field(default_factory=lambda: str(uuid.uuid4()))


# Response DTOs
class ClaimDto(BaseModel):
    text: str
    citedEvidenceId: Optional[uuid.UUID] = None
    supportedByText: bool
    supportedByGraph: bool
    isSupported: bool


class CitationDto(BaseModel):
    chunkId: uuid.UUID
    documentId: uuid.UUID
    documentName: str
    pageNumber: Optional[int] = None
    sectionHeading: Optional[str] = None
    sourceExcerpt: str


class ChatAnswerResponse(BaseModel):
    sessionId: uuid.UUID
    question: str
    answerMode: AnswerMode
    answerText: str
    confidence: Optional[float] = None
    isNotFound: bool = False
    reason: Optional[str] = None
    claims: List[ClaimDto] = Field(default_factory=list)
    citations: List[CitationDto] = Field(default_factory=list)
    diagnostics: Optional[dict[str, Any]] = None


@router.post(
    "/answer",
    response_model=ChatAnswerResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate and verify grounded answer from evidence package",
)
async def generate_and_verify_answer(
    request: ChatAnswerRequest,
) -> ChatAnswerResponse:
    req_id = request.requestId or str(uuid.uuid4())
    logger.info(
        "Received /internal/ai/chat/answer requestId=%s workspaceId=%s mode=%s",
        req_id,
        request.workspaceId,
        request.mode.value,
    )

    if not request.resolvedDocumentIds:
        logger.info("Empty resolvedDocumentIds requestId=%s; returning not-found", req_id)
        nf = NotFoundHandler.build(internal_reason="empty_scope")
        return ChatAnswerResponse(
            sessionId=request.sessionId or uuid.uuid4(),
            question=request.question,
            answerMode=request.mode,
            answerText=nf.answerText,
            confidence=None,
            isNotFound=True,
            reason=nf.reason,
            claims=[],
            citations=[],
            diagnostics=None,
        )

    # 1. Epic 6 Retrieval
    try:
        retrieval_service = RetrievalService()

        retrieval_req = RetrievalRequest(
            workspaceId=request.workspaceId,
            resolvedDocumentIds=request.resolvedDocumentIds,
            scopeType=request.scopeType,
            question=request.question,
            answerMode=request.mode,
            conversationContext=request.conversationContext,
            requestId=req_id,
        )
        evidence_package = retrieval_service.retrieve(retrieval_req)
    except Exception as exc:
        logger.error("Retrieval step failed in answer pipeline requestId=%s: %s", req_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Retrieval step failed: {exc}",
        ) from exc

    # 2. Check empty evidence package
    if not evidence_package.chunks:
        logger.info("No evidence chunks found for question requestId=%s; returning not-found", req_id)
        nf = NotFoundHandler.build(internal_reason="empty_evidence")
        return ChatAnswerResponse(
            sessionId=request.sessionId or uuid.uuid4(),
            question=request.question,
            answerMode=request.mode,
            answerText=nf.answerText,
            confidence=None,
            isNotFound=True,
            reason=nf.reason,
            claims=[],
            citations=[],
            diagnostics=evidence_package.diagnostics.model_dump(),
        )

    # 3. Epic 7 Story 7.1 — Answer Generation
    try:
        gen_service = AnswerGenerationService()
        draft_answer = gen_service.generate_answer(request.question, evidence_package)
    except ProviderError as exc:
        logger.error("LLM Provider failed requestId=%s: %s", req_id, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"LLM Provider unavailable: {exc}",
        ) from exc
    except Exception as exc:
        logger.error("Answer generation error requestId=%s: %s", req_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Generation failed: {exc}",
        ) from exc

    if draft_answer is None:
        logger.info("Draft generation produced empty/declined answer requestId=%s", req_id)
        nf = NotFoundHandler.build(internal_reason="generation_declined")
        return ChatAnswerResponse(
            sessionId=request.sessionId or uuid.uuid4(),
            question=request.question,
            answerMode=request.mode,
            answerText=nf.answerText,
            confidence=None,
            isNotFound=True,
            reason=nf.reason,
            claims=[],
            citations=[],
            diagnostics=evidence_package.diagnostics.model_dump(),
        )

    # 4. Epic 7 Story 7.2 — Claim Verification
    try:
        verifier = ClaimVerificationService()
        verified_answer = verifier.verify(
            draft_answer=draft_answer,
            evidence_package=evidence_package,
            mode=request.mode,
            workspace_id=request.workspaceId,
            resolved_document_ids=request.resolvedDocumentIds,
        )
    except Exception as exc:
        logger.error("Verification failed requestId=%s: %s", req_id, exc)
        # Fail closed -> treat verification failure as not-found
        nf = NotFoundHandler.build(internal_reason="verification_exception")
        return ChatAnswerResponse(
            sessionId=request.sessionId or uuid.uuid4(),
            question=request.question,
            answerMode=request.mode,
            answerText=nf.answerText,
            confidence=None,
            isNotFound=True,
            reason=nf.reason,
            claims=[],
            citations=[],
            diagnostics=evidence_package.diagnostics.model_dump(),
        )

    if verified_answer is None:
        logger.info("Claim verification downgraded answer to not-found requestId=%s", req_id)
        nf = NotFoundHandler.build(internal_reason="verification_insufficient")
        return ChatAnswerResponse(
            sessionId=request.sessionId or uuid.uuid4(),
            question=request.question,
            answerMode=request.mode,
            answerText=nf.answerText,
            confidence=None,
            isNotFound=True,
            reason=nf.reason,
            claims=[],
            citations=[],
            diagnostics=evidence_package.diagnostics.model_dump(),
        )

    # 5. Build successful response
    claim_dtos = [
        ClaimDto(
            text=c.text,
            citedEvidenceId=c.cited_evidence_id,
            supportedByText=c.supported_by_text,
            supportedByGraph=c.supported_by_graph,
            isSupported=c.is_supported,
        )
        for c in verified_answer.claims
    ]

    citation_dtos = [
        CitationDto(
            chunkId=c.chunk_id,
            documentId=c.document_id,
            documentName=c.document_name,
            pageNumber=c.page_number,
            sectionHeading=c.section_heading,
            sourceExcerpt=c.source_excerpt,
        )
        for c in verified_answer.citations
    ]

    return ChatAnswerResponse(
        sessionId=request.sessionId or uuid.uuid4(),
        question=request.question,
        answerMode=request.mode,
        answerText=verified_answer.answer_text,
        confidence=verified_answer.confidence,
        isNotFound=False,
        reason=None,
        claims=claim_dtos,
        citations=citation_dtos,
        diagnostics=evidence_package.diagnostics.model_dump(),
    )
