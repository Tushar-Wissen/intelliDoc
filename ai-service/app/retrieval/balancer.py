"""Comparison evidence is quota-balanced so one document cannot crowd the others out."""

from __future__ import annotations

import math
import uuid
from collections import defaultdict
from collections.abc import Callable

from app.retrieval.config import RetrievalConfig
from app.retrieval.merger import ScoredChunk

Fanout = Callable[[uuid.UUID], list[ScoredChunk]]


def balance(
    candidates: list[ScoredChunk],
    *,
    question_type: str,
    document_ids: list[uuid.UUID],
    config: RetrievalConfig,
    fanout: Fanout | None = None,
) -> tuple[list[ScoredChunk], dict[str, int], bool]:
    budget = (
        config.package_max_chunks_summary
        if question_type == "summary"
        else config.package_max_chunks
    )
    pooled = _dedupe(candidates)
    fanout_fired = False
    if question_type in {"comparison", "cross-document"} and fanout is not None:
        if 1 < len(document_ids) <= config.balance_fanout_max_docs:
            present = {item.chunk.document_id for item in pooled}
            missing = [document_id for document_id in document_ids if document_id not in present]
            if missing:
                fanout_fired = True
                for document_id in missing:
                    pooled.extend(fanout(document_id))
                pooled = _dedupe(pooled)
    if question_type == "summary":
        selected = _diverse(pooled, budget)
    elif question_type in {"comparison", "cross-document"}:
        selected = _quota(pooled, document_ids, budget, config.balance_max_share)
    else:
        selected = _top(pooled, budget)
    counts: dict[str, int] = defaultdict(int)
    for item in selected:
        counts[str(item.chunk.document_id)] += 1
    return selected, dict(counts), fanout_fired


def _dedupe(candidates: list[ScoredChunk]) -> list[ScoredChunk]:
    best: dict[uuid.UUID, ScoredChunk] = {}
    for item in candidates:
        current = best.get(item.chunk.id)
        if current is None or item.score > current.score:
            best[item.chunk.id] = item
    return list(best.values())


def _top(candidates: list[ScoredChunk], budget: int) -> list[ScoredChunk]:
    ordered = sorted(candidates, key=lambda item: (-item.score, str(item.chunk.id)))
    return ordered[:budget]


def _diverse(candidates: list[ScoredChunk], budget: int) -> list[ScoredChunk]:
    ordered = sorted(candidates, key=lambda item: (-item.score, str(item.chunk.id)))
    picked: list[ScoredChunk] = []
    deferred: list[ScoredChunk] = []
    seen_sections: set[uuid.UUID] = set()
    for item in ordered:
        section_id = item.chunk.section_id
        if section_id is not None and section_id in seen_sections:
            deferred.append(item)
            continue
        picked.append(item)
        if section_id is not None:
            seen_sections.add(section_id)
        if len(picked) >= budget:
            return picked
    for item in deferred:
        if len(picked) >= budget:
            break
        picked.append(item)
    return picked


def _quota(
    candidates: list[ScoredChunk],
    document_ids: list[uuid.UUID],
    budget: int,
    max_share: float,
) -> list[ScoredChunk]:
    if budget <= 0:
        return []
    by_doc: dict[uuid.UUID, list[ScoredChunk]] = defaultdict(list)
    for item in candidates:
        by_doc[item.chunk.document_id].append(item)
    for items in by_doc.values():
        items.sort(key=lambda item: (-item.score, str(item.chunk.id)))
    docs = [document_id for document_id in document_ids if by_doc.get(document_id)]
    if not docs:
        return []
    floor = budget // len(docs)
    cap = max(1, math.ceil(budget * max_share))
    selected: list[ScoredChunk] = []
    used = {document_id: 0 for document_id in docs}

    def can_take(document_id: uuid.UUID) -> bool:
        if not by_doc[document_id]:
            return False
        if len(docs) == 1:
            return True
        if used[document_id] < cap:
            return True
        return not any(by_doc[other] for other in docs if other != document_id)

    for _ in range(floor):
        for document_id in docs:
            if len(selected) >= budget or not can_take(document_id):
                continue
            selected.append(by_doc[document_id].pop(0))
            used[document_id] += 1
    while len(selected) < budget:
        progressed = False
        for document_id in docs:
            if len(selected) >= budget or not can_take(document_id):
                continue
            selected.append(by_doc[document_id].pop(0))
            used[document_id] += 1
            progressed = True
        if not progressed:
            break
    return selected
