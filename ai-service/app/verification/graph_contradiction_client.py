"""Graph contradiction client wrapping Epic 5 graph verification (Story 7.2)."""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass

from app.pipeline.kg import Contradiction, contradictions_in_scope

logger = logging.getLogger(__name__)


@dataclass
class GraphCheckResult:
    has_contradiction: bool
    contradictions: list[Contradiction]
    query_failed: bool = False


class GraphContradictionClient:
    def __init__(self, store=None) -> None:
        self._store = store

    def check_scope_contradictions(
        self,
        workspace_id: uuid.UUID,
        resolved_document_ids: list[uuid.UUID],
    ) -> GraphCheckResult:
        """Fetch all graph contradictions strictly bounded to workspace_id and resolved_document_ids."""
        try:
            items = contradictions_in_scope(
                workspace_id=workspace_id,
                resolved_document_ids=resolved_document_ids,
                store=self._store,
            )
            return GraphCheckResult(has_contradiction=bool(items), contradictions=items, query_failed=False)
        except Exception as exc:
            logger.error(
                "Graph contradiction query failed workspaceId=%s: %s",
                workspace_id,
                exc,
            )
            # Fail closed: mark as query_failed so verification treats affected claims as unverified
            return GraphCheckResult(has_contradiction=True, contradictions=[], query_failed=True)

    def claim_conflicts_with_contradictions(
        self,
        claim_text: str,
        contradictions: list[Contradiction],
    ) -> bool:
        """Check if claim text references values or labels involved in a graph contradiction."""
        if not contradictions:
            return False

        claim_lower = claim_text.lower()
        for item in contradictions:
            left_val = str(item.left_value).lower()
            right_val = str(item.right_value).lower()
            label = str(item.label).lower()

            # If claim mentions both conflicting values, or mentions the label with one value while another exists
            if (left_val in claim_lower and right_val in claim_lower) or (label in claim_lower and (left_val in claim_lower or right_val in claim_lower)):
                logger.info("Claim conflicts with graph contradiction: %s vs %s", left_val, right_val)
                return True

        return False
