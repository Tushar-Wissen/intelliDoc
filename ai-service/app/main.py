from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from app.schemas import (
    HealthResponse,
    AnalyzeRequest,
    AnalyzeResponse,
    ExtractionRequest,
    ExtractionResponse,
    QARequest,
    QAResponse,
    ErrorResponse,
)
from app.services.processor import DocumentProcessor

app = FastAPI(
    title="IntelliDoc AI Service",
    description="Python microservice providing NLP document summarization, entity extraction, sentiment analysis, and question answering.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Enable CORS for cross-origin integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def check_health():
    """Health check endpoint confirming service status and readiness."""
    return HealthResponse(
        status="UP",
        service="intellidoc-ai-service",
        version="1.0.0",
        model_loaded=True,
        ai_configured=DocumentProcessor.LLM_CLASSIFIER.enabled,
    )


@app.post(
    "/api/v1/analyze",
    response_model=AnalyzeResponse,
    responses={400: {"model": ErrorResponse}},
    tags=["Analysis"]
)
async def analyze_document(request: AnalyzeRequest):
    """Analyze document text content to extract summary, entities, sentiment, and key topics."""
    if not request.content or not request.content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document content cannot be empty."
        )

    try:
        return DocumentProcessor.process_document(
            doc_id=request.document_id,
            title=request.title or "Untitled Document",
            content=request.content,
            max_summary_length=request.max_summary_length or 150
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Analysis processing error: {str(e)}"
        )


@app.post(
    "/api/v1/extract",
    response_model=ExtractionResponse,
    responses={400: {"model": ErrorResponse}},
    tags=["Extraction"],
)
async def extract_document(request: ExtractionRequest):
    """Classify a fixture document and extract schema-validated fields with provenance."""
    if not request.content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document content cannot be empty.",
        )

    try:
        return DocumentProcessor.extract_document(
            doc_id=request.document_id,
            title=request.title,
            content=request.content,
            chunks=request.chunks,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Extraction processing error: {str(e)}",
        )


@app.post(
    "/api/v1/qa",
    response_model=QAResponse,
    responses={400: {"model": ErrorResponse}},
    tags=["Q&A"]
)
async def ask_question(request: QARequest):
    """Answer question based on document context."""
    if not request.context or not request.context.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Context content cannot be empty."
        )
    if not request.question or not request.question.strip():
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
            detail=f"Q&A processing error: {str(e)}"
        )
