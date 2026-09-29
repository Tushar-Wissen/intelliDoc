"""Load the source chunk for a graph fact through the same scope filter as text search."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.db.repository import ChunkRecord, PipelineRepository


@dataclass(frozen=True)
class ResolvedFact:
    fact_type: str
    subject: str
    relationship: str
    object: str
    document_id: str
    source_chunk_id: str | None
    source_page: int | None


def resolve_facts(
    facts: list[ResolvedFact],
    *,
    workspace_id: uuid.UUID,
    document_ids: list[uuid.UUID],
    repo: PipelineRepository,
) -> tuple[list[ChunkRecord], list[ResolvedFact], int]:
    allowed = {str(document_id) for document_id in document_ids}
    parsed: list[uuid.UUID] = []
    for fact in facts:
        chunk_id = _uuid_or_none(fact.source_chunk_id)
        if chunk_id is not None:
            parsed.append(chunk_id)
    found = repo.scoped_chunks_by_ids(workspace_id, document_ids, parsed) if parsed else []
    by_id = {str(chunk.id): chunk for chunk in found}
    kept: list[ResolvedFact] = []
    chunks: list[ChunkRecord] = []
    seen: set[uuid.UUID] = set()
    discarded = 0
    for fact in facts:
        if fact.document_id not in allowed:
            discarded += 1
            continue
        chunk = by_id.get(str(fact.source_chunk_id)) if fact.source_chunk_id else None
        if chunk is None or str(chunk.document_id) not in allowed:
            discarded += 1
            continue
        kept.append(fact)
        if chunk.id not in seen:
            seen.add(chunk.id)
            chunks.append(chunk)
    return chunks, kept, discarded


def _uuid_or_none(value: str | None) -> uuid.UUID | None:
    if not value:
        return None
    try:
        return uuid.UUID(str(value))
    except ValueError:
        return None
