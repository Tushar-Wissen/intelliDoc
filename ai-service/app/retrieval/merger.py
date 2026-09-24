"""Union channel hits by chunk id and order them with reciprocal rank fusion."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field

from app.db.repository import ChunkRecord

_CHANNEL_ORDER = ("vector", "keyword", "graph")


@dataclass
class ScoredChunk:
    chunk: ChunkRecord
    provenance: list[str]
    rrf_score: float
    score: float


@dataclass
class _Slot:
    chunk: ChunkRecord
    ranks: dict[str, int] = field(default_factory=dict)


def merge(
    channels: dict[str, list[ChunkRecord]],
    *,
    rrf_k: int,
    cap: int,
) -> list[ScoredChunk]:
    slots: dict[uuid.UUID, _Slot] = {}
    for name in _CHANNEL_ORDER:
        for rank, chunk in enumerate(channels.get(name) or [], start=1):
            slot = slots.get(chunk.id)
            if slot is None:
                slot = _Slot(chunk=chunk)
                slots[chunk.id] = slot
            current = slot.ranks.get(name)
            if current is None or rank < current:
                slot.ranks[name] = rank
    fused: list[ScoredChunk] = []
    for slot in slots.values():
        rrf = sum(1.0 / (rrf_k + rank) for rank in slot.ranks.values())
        provenance = [name for name in _CHANNEL_ORDER if name in slot.ranks]
        fused.append(
            ScoredChunk(
                chunk=slot.chunk,
                provenance=provenance,
                rrf_score=rrf,
                score=rrf,
            )
        )
    fused.sort(key=lambda item: (-item.rrf_score, str(item.chunk.id)))
    if cap > 0:
        return fused[:cap]
    return fused
