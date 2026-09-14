from typing import List, Optional
from enum import Enum
from pydantic import BaseModel, Field


class SentimentEnum(str, Enum):
    POSITIVE = "POSITIVE"
    NEUTRAL = "NEUTRAL"
    NEGATIVE = "NEGATIVE"


class HealthResponse(BaseModel):
    status: str = Field(default="UP", json_schema_extra={"example": "UP"})
    service: str = Field(default="intellidoc-ai-service", json_schema_extra={"example": "intellidoc-ai-service"})
    version: str = Field(default="1.0.0", json_schema_extra={"example": "1.0.0"})
    model_loaded: bool = Field(default=True, json_schema_extra={"example": True})


class AnalyzeRequest(BaseModel):
    document_id: str = Field(..., description="Unique document ID", json_schema_extra={"example": "doc_12345"})
    title: Optional[str] = Field(None, description="Document title", json_schema_extra={"example": "Quarterly Financial Report Q3.pdf"})
    content: str = Field(..., description="Document text content", json_schema_extra={"example": "The company recorded revenue growth of 18% in Q3..."})
    max_summary_length: Optional[int] = Field(default=150, description="Maximum character length of generated summary")


class AnalyzeResponse(BaseModel):
    document_id: str = Field(..., json_schema_extra={"example": "doc_12345"})
    summary: str = Field(..., json_schema_extra={"example": "Executive summary highlighting 18% quarterly revenue growth..."})
    entities: List[str] = Field(default_factory=list, json_schema_extra={"example": ["Q3", "18% Revenue", "Finance Corp"]})
    sentiment: SentimentEnum = Field(..., json_schema_extra={"example": "POSITIVE"})
    key_topics: List[str] = Field(default_factory=list, json_schema_extra={"example": ["Revenue", "Earnings", "Financial Growth"]})
    confidence_score: float = Field(..., json_schema_extra={"example": 0.95})


class QARequest(BaseModel):
    document_id: str = Field(..., json_schema_extra={"example": "doc_12345"})
    context: str = Field(..., json_schema_extra={"example": "The net margin increased to 22 percent in fiscal year 2025."})
    question: str = Field(..., json_schema_extra={"example": "What was the net margin percentage?"})


class QAResponse(BaseModel):
    document_id: str = Field(..., json_schema_extra={"example": "doc_12345"})
    question: str = Field(..., json_schema_extra={"example": "What was the net margin percentage?"})
    answer: str = Field(..., json_schema_extra={"example": "The net margin percentage increased to 22%."})
    confidence: float = Field(..., json_schema_extra={"example": 0.92})


class ErrorResponse(BaseModel):
    error: str
    detail: str
