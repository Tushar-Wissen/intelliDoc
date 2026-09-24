"""Assemble the evidence package from source chunk text only (BR-011)."""

from __future__ import annotations

import uuid

from app.retrieval.config import RetrievalConfig
from app.retrieval.errors import RetrievalError
from app.retrieval.graph_fact_resolver import ResolvedFact
from app.retrieval.merger import ScoredChunk
from app.retrieval.schemas import (
    AnswerMode,
    ContradictionPair,
    EvidenceChunk,
    EvidencePackage,
    GraphFactModel,
    QuestionType,
    RetrievalDiagnostics,
    RetrievalRequest,
)


def build_package(
    *,
    request: RetrievalRequest,
    question_type: str,
    rewritten_query: str,
    selected: list[ScoredChunk],
    facts: list[ResolvedFact],
    contradictions: list[ContradictionPair],
    diagnostics: RetrievalDiagnostics,
    document_names: dict[uuid.UUID, str],
    section_headings: dict[uuid.UUID, str | None],
    config: RetrievalConfig,
) -> EvidencePackage:
    allowed = set(request.resolvedDocumentIds)
    protected = _protected_ids(selected, question_type, config.package_max_chunks)
    trimmed = _trim_tokens(selected, protected, config.package_max_tokens)
    chunks: list[EvidenceChunk] = []
    for item in sorted(trimmed, key=lambda candidate: (-candidate.score, str(candidate.chunk.id))):
        chunk = item.chunk
        if chunk.document_id not in allowed:
            raise RetrievalError("SCOPE_VIOLATION", "Evidence chunk is outside the resolved scope")
        if not chunk.chunk_text:
            raise RetrievalError("RETRIEVAL_UNAVAILABLE", "Evidence item is missing source text")
        heading = section_headings.get(chunk.section_id) if chunk.section_id else None
        chunks.append(
            EvidenceChunk(
                chunkId=chunk.id,
                documentId=chunk.document_id,
                documentName=document_names.get(chunk.document_id, ""),
                pageNumber=chunk.page_number,
                sectionId=chunk.section_id,
                sectionHeading=heading,
                text=chunk.chunk_text,
                rerankScore=item.score,
                provenance=list(item.provenance),
            )
        )
    graph_facts: list[GraphFactModel] = []
    for fact in facts:
        document_id = uuid.UUID(fact.document_id)
        if document_id not in allowed:
            continue
        graph_facts.append(
            GraphFactModel(
                factType=fact.fact_type,
                subject=fact.subject,
                relationship=fact.relationship,
                object=fact.object,
                documentId=document_id,
                sourceChunkId=uuid.UUID(fact.source_chunk_id) if fact.source_chunk_id else None,
                sourcePage=fact.source_page,
            )
        )
    counts: dict[str, int] = {}
    for chunk in chunks:
        key = str(chunk.documentId)
        counts[key] = counts.get(key, 0) + 1
    return EvidencePackage(
        questionType=QuestionType(question_type),
        rewrittenQuery=rewritten_query,
        answerMode=AnswerMode(request.answerMode),
        workspaceId=request.workspaceId,
        resolvedDocumentIds=list(request.resolvedDocumentIds),
        chunks=chunks,
        graphFacts=graph_facts,
        contradictions=contradictions,
        perDocumentCounts=counts,
        diagnostics=diagnostics,
    )


def _protected_ids(selected: list[ScoredChunk], question_type: str, max_chunks: int) -> set[uuid.UUID]:
    if question_type not in {"comparison", "cross-document"}:
        return set()
    by_doc: dict[uuid.UUID, list[ScoredChunk]] = {}
    for item in selected:
        by_doc.setdefault(item.chunk.document_id, []).append(item)
    if not by_doc:
        return set()
    floor = max_chunks // len(by_doc)
    protected: set[uuid.UUID] = set()
    for items in by_doc.values():
        ordered = sorted(items, key=lambda item: (-item.score, str(item.chunk.id)))
        for item in ordered[:floor]:
            protected.add(item.chunk.id)
    return protected


def _trim_tokens(selected: list[ScoredChunk], protected: set[uuid.UUID], budget: int) -> list[ScoredChunk]:
    remaining = list(selected)
    while _tokens(remaining) > budget:
        droppable = [item for item in remaining if item.chunk.id not in protected]
        if not droppable:
            break
        lowest = min(droppable, key=lambda item: (item.score, str(item.chunk.id)))
        remaining = [item for item in remaining if item.chunk.id != lowest.chunk.id]
    return remaining


def _tokens(items: list[ScoredChunk]) -> int:
    total = 0
    for item in items:
        count = item.chunk.token_count
        if count is None:
            count = max(1, len(item.chunk.chunk_text.split()))
        total += count
    return total
