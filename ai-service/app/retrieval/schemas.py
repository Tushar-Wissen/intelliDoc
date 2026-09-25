"""Internal retrieval contract consumed by Epic 7. Field names are the JSON contract."""

from __future__ import annotations

import uuid
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class AnswerMode(str, Enum):
    RETRIEVAL_ONLY = "retrieval_only"
    RETRIEVAL_PLUS_GRAPH = "retrieval_plus_graph"


class QuestionType(str, Enum):
    FACT = "fact"
    SUMMARY = "summary"
    COMPARISON = "comparison"
    CROSS_DOCUMENT = "cross-document"


class ScopeType(str, Enum):
    WORKSPACE = "workspace"
    MODULE = "module"
    DOCUMENTS = "documents"


class ConversationTurn(BaseModel):
    role: str
    content: str


class RetrievalRequest(BaseModel):
    workspaceId: uuid.UUID
    resolvedDocumentIds: list[uuid.UUID]
    scopeType: ScopeType
    question: str
    answerMode: AnswerMode
    conversationContext: list[ConversationTurn] = Field(default_factory=list)
    requestId: str


class QuestionRewriteSchema(BaseModel):
    type: QuestionType
    rewrittenQuery: str = Field(min_length=1)


class EvidenceChunk(BaseModel):
    chunkId: uuid.UUID
    documentId: uuid.UUID
    documentName: str
    pageNumber: int | None = None
    sectionId: uuid.UUID | None = None
    sectionHeading: str | None = None
    text: str
    rerankScore: float
    provenance: list[str]


class GraphFactModel(BaseModel):
    factType: str
    subject: str
    relationship: str
    object: str
    documentId: uuid.UUID
    sourceChunkId: uuid.UUID | None = None
    sourcePage: int | None = None


class ContradictionSide(BaseModel):
    factType: str
    label: str
    value: str
    documentId: uuid.UUID
    sourceChunkId: uuid.UUID | None = None
    sourcePage: int | None = None


class ContradictionPair(BaseModel):
    left: ContradictionSide
    right: ContradictionSide


class RetrievalDiagnostics(BaseModel):
    graphStatus: Literal["OK", "SKIPPED", "FAILED"]
    rerankSkipped: bool
    vectorCount: int
    keywordCount: int
    graphChunkCount: int
    mergedCount: int
    excludedDocumentIds: list[uuid.UUID]
    vectorLatencyMs: int
    keywordLatencyMs: int
    graphLatencyMs: int
    totalLatencyMs: int


class EvidencePackage(BaseModel):
    questionType: QuestionType
    rewrittenQuery: str
    answerMode: AnswerMode
    workspaceId: uuid.UUID
    resolvedDocumentIds: list[uuid.UUID]
    chunks: list[EvidenceChunk]
    graphFacts: list[GraphFactModel]
    contradictions: list[ContradictionPair]
    perDocumentCounts: dict[str, int]
    diagnostics: RetrievalDiagnostics
