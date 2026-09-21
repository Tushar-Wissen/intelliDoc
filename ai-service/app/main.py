from fastapi import FastAPI, File, Form, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware

from app.schemas import (
    HealthResponse,
    AnalyzeRequest,
    AnalyzeResponse,
    QARequest,
    QAResponse,
    ErrorResponse,
    ExtractionRequest,
    ExtractionResponse,
)

from app.services.processor import DocumentProcessor
from app.services.extractor import SelectiveExtractor
from app.services.file_extractor import DocumentFileExtractor


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


@app.get("/", tags=["Health"])
async def root():
    """Provide a discoverable response when the service root is opened."""
    return {
        "service": "intellidoc-ai-service",
        "status": "UP",
        "docs": "/docs",
        "health": "/health",
    }


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


@app.post(
    "/api/v1/extract",
    response_model=ExtractionResponse,
    responses={400: {"model": ErrorResponse}},
    tags=["Extraction"]
)
async def extract_document(request: ExtractionRequest):
    """Selectively use native page text or an OCR result and preserve page provenance."""
    result = SelectiveExtractor.extract(request.document_id, request.pages)
    if not result.combined_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No extractable text was found in the supplied pages."
        )
    return result


@app.post(
    "/api/v1/extract/file",
    response_model=ExtractionResponse,
    responses={400: {"model": ErrorResponse}},
    tags=["Extraction"]
)
async def extract_document_file(
    document_id: str = Form(...),
    file: UploadFile = File(...),
):
    """Extract text from a PDF, DOCX, or image upload with selective OCR."""
    try:
        content = await file.read()
        return DocumentFileExtractor.extract(document_id, file.filename or "document", content)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error


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