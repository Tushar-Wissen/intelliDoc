from typing import List, Optional
from enum import Enum

from pydantic import BaseModel, Field


class SentimentEnum(str, Enum):
    POSITIVE = "POSITIVE"
    NEUTRAL = "NEUTRAL"
    NEGATIVE = "NEGATIVE"


class HealthResponse(BaseModel):

    status: str = Field(
        default="UP",
        json_schema_extra={
            "example": "UP"
        }
    )

    service: str = Field(
        default="intellidoc-ai-service",
        json_schema_extra={
            "example": "intellidoc-ai-service"
        }
    )

    version: str = Field(
        default="1.0.0",
        json_schema_extra={
            "example": "1.0.0"
        }
    )

    model_loaded: bool = Field(
        default=True,
        json_schema_extra={
            "example": True
        }
    )


# ============================================================
# DOCUMENT TEXT BLOCK
# ============================================================

class DocumentTextBlock(BaseModel):
    """
    Represents a piece of text extracted from a PDF page
    or PPTX slide together with its visual information.
    """

    text: str

    # PAGE for PDF
    # SLIDE for PPTX
    type: str = "PAGE"

    # Page number / slide number
    page_number: Optional[int] = None

    # Position
    x: Optional[float] = None
    y: Optional[float] = None

    # Dimensions
    width: Optional[float] = None
    height: Optional[float] = None

    # Font information
    font_size: Optional[float] = None

    bold: bool = False

    italic: bool = False


# ============================================================
# ANALYZE REQUEST
# ============================================================

class AnalyzeRequest(BaseModel):

    document_id: str = Field(
        ...,
        description="Unique document ID",
        json_schema_extra={
            "example": "doc_12345"
        }
    )

    title: Optional[str] = Field(
        None,
        description="Document title",
        json_schema_extra={
            "example": "Quarterly Financial Report Q3.pdf"
        }
    )

    content: str = Field(
        ...,
        description="Document text content",
        json_schema_extra={
            "example": "The company recorded revenue growth of 18% in Q3..."
        }
    )

    max_summary_length: Optional[int] = Field(
        default=150,
        description="Maximum character length of generated summary"
    )

    # --------------------------------------------------------
    # NEW
    # Structured PDF/PPTX text blocks
    # --------------------------------------------------------

    blocks: List[DocumentTextBlock] = Field(
        default_factory=list,
        description="Structured text blocks extracted from PDF/PPTX"
    )


# ============================================================
# DOCUMENT MODULE
# ============================================================

class DocumentModule(BaseModel):

    module_number: str

    module_name: str

    children: List["DocumentModule"] = Field(
        default_factory=list
    )


# ============================================================
# ANALYZE RESPONSE
# ============================================================

class AnalyzeResponse(BaseModel):

    document_id: str

    summary: str

    entities: List[str] = Field(
        default_factory=list
    )

    sentiment: SentimentEnum

    key_topics: List[str] = Field(
        default_factory=list
    )

    confidence_score: float

    modules: List[DocumentModule] = Field(
        default_factory=list
    )


# ============================================================
# QA REQUEST
# ============================================================

class ExtractionPageInput(BaseModel):
    page_number: int = Field(..., ge=1)
    native_text: Optional[str] = None
    ocr_text: Optional[str] = None
    ocr_confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)


class ExtractionRequest(BaseModel):
    document_id: str = Field(..., json_schema_extra={"example": "doc_12345"})
    pages: List[ExtractionPageInput] = Field(..., min_length=1)


class ExtractedPage(BaseModel):
    page_number: int
    method: str
    text: str
    confidence: Optional[float] = None


class ExtractedSection(BaseModel):
    section_id: str
    heading: str
    parent_section_id: Optional[str] = None
    start_page: int
    end_page: int


class ExtractedChunk(BaseModel):
    chunk_id: str
    section_id: Optional[str] = None
    page_number: int
    chunk_text: str
    token_count: int


class ExtractionResponse(BaseModel):
    document_id: str
    pages: List[ExtractedPage]
    combined_text: str
    ocr_pages: List[int]
    native_pages: List[int]
    sections: List[ExtractedSection] = Field(default_factory=list)
    chunks: List[ExtractedChunk] = Field(default_factory=list)
    extraction_version: str = "selective-ocr-v1"


class QARequest(BaseModel):

    document_id: str = Field(
        ...,
        json_schema_extra={
            "example": "doc_12345"
        }
    )

    context: str = Field(
        ...,
        json_schema_extra={
            "example": "The net margin increased to 22 percent in fiscal year 2025."
        }
    )

    question: str = Field(
        ...,
        json_schema_extra={
            "example": "What was the net margin percentage?"
        }
    )


# ============================================================
# QA RESPONSE
# ============================================================

class QAResponse(BaseModel):
    document_id: str = Field(..., json_schema_extra={"example": "doc_12345"})
    question: str = Field(..., json_schema_extra={"example": "What was the net margin percentage?"})
    answer: str = Field(..., json_schema_extra={"example": "The net margin percentage increased to 22%."})
    confidence: float = Field(..., json_schema_extra={"example": 0.92})
    is_not_found: bool = False
    citations: List["QACitation"] = Field(default_factory=list)


class QACitation(BaseModel):
    page_number: Optional[int] = None
    source_excerpt: str


# ============================================================
# ERROR RESPONSE
# ============================================================

class ErrorResponse(BaseModel):

    error: str

    detail: str