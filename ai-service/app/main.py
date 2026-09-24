import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from app.schemas import (
    HealthResponse,
    AnalyzeRequest,
    AnalyzeResponse,
    QARequest,
    QAResponse,
    ErrorResponse,
)

from app.routers.documents import router as documents_router
from app.routers.chat_answer import router as chat_answer_router
from app.services.processor import DocumentProcessor

logger = logging.getLogger(__name__)



@asynccontextmanager
async def _lifespan(_app: FastAPI):
    _init_neo4j_schema()
    yield


def _init_neo4j_schema() -> None:
    """Create graph indexes and uniqueness constraints. Neo4j downtime does not block /health."""
    try:
        from app.pipeline.neo4j_schema_init import ensure_neo4j_schema

        ensure_neo4j_schema()
    except Exception:
        logger.exception("Neo4j schema init skipped")


app = FastAPI(
    title="IntelliDoc AI Service",
    description=(
        "Python microservice providing NLP document "
        "summarization, entity extraction, sentiment "
        "analysis, module extraction, and question answering."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=_lifespan,
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents_router)
app.include_router(chat_answer_router)


# ============================================================
# HEALTH
# ============================================================

@app.get(
    "/health",
    response_model=HealthResponse,
    tags=["Health"]
)
async def check_health():
    """Health check endpoint."""

    return HealthResponse(
        status="UP",
        service="intellidoc-ai-service",
        version="1.0.0",
        model_loaded=True
    )


# ============================================================
# DOCUMENT ANALYSIS
# ============================================================

@app.post(
    "/api/v1/analyze",
    response_model=AnalyzeResponse,
    responses={
        400: {
            "model": ErrorResponse
        }
    },
    tags=["Analysis"]
)
async def analyze_document(
        request: AnalyzeRequest
):
    """
    Analyze document and extract modules.

    For PDF/PPTX:
        text + font + position information is used.

    For other document types:
        text-based fallback is used.
    """

    if (
            not request.content
            or not request.content.strip()
    ):

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document content cannot be empty."
        )

    try:

        return DocumentProcessor.process_document(

            doc_id=request.document_id,

            title=(
                request.title
                or "Untitled Document"
            ),

            content=request.content,

            max_summary_length=(
                request.max_summary_length
                or 150
            ),

            # NEW
            blocks=request.blocks

        )

    except Exception as e:

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Analysis processing error: "
                + str(e)
            )
        )


# ============================================================
# QUESTION ANSWERING
# ============================================================

@app.post(
    "/api/v1/qa",
    response_model=QAResponse,
    responses={
        400: {
            "model": ErrorResponse
        }
    },
    tags=["Q&A"]
)
async def ask_question(
        request: QARequest
):
    """Answer question based on document context."""

    if (
            not request.context
            or not request.context.strip()
    ):

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Context content cannot be empty."
        )

    if (
            not request.question
            or not request.question.strip()
    ):

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Question cannot be empty."
        )

    try:

        return DocumentProcessor.answer_question(

            doc_id=request.document_id,

            context=request.context,

            question=request.question

        )

    except Exception as e:

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Q&A processing error: "
                + str(e)
            )
        )