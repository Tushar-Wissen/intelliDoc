"""Rejects a scope Epic 6 did not receive as already resolved (BR-003, BR-004, BR-013)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.db.repository import READY, PipelineRepository
from app.retrieval.errors import RetrievalError


@dataclass(frozen=True)
class ScopeDecision:
    ready_ids: list[uuid.UUID]
    excluded_ids: list[uuid.UUID]


class ScopeGuard:
    def __init__(self, repo: PipelineRepository) -> None:
        self._repo = repo

    def validate(self, workspace_id: uuid.UUID, document_ids: list[uuid.UUID]) -> ScopeDecision:
        if not document_ids:
            raise RetrievalError("INVALID_SCOPE", "resolvedDocumentIds is empty")
        rows = self._repo.list_documents(list(document_ids))
        by_id = {row.id: row for row in rows}
        for document_id in document_ids:
            row = by_id.get(document_id)
            if row is None or row.workspace_id != workspace_id:
                raise RetrievalError(
                    "SCOPE_VIOLATION",
                    "A resolved document does not belong to the workspace",
                )
        ready = [document_id for document_id in document_ids if by_id[document_id].processing_status == READY]
        excluded = [document_id for document_id in document_ids if by_id[document_id].processing_status != READY]
        return ScopeDecision(ready_ids=ready, excluded_ids=excluded)
