"""Per-hop admission for the induced subgraph (Story 6.2 AC4). Pure function."""

from __future__ import annotations

from dataclasses import dataclass

from app.pipeline.kg_schema import FACT_LABELS

# Shared Organization/Person/Topic nodes keep the first writer's document_id.
# That scalar must not decide whether the node can be touched inside a module.
_NAMED_LABELS = frozenset({"Organization", "Person", "Topic"})


@dataclass(frozen=True)
class Hop:
    destination_workspace_id: str | None
    destination_label: str
    destination_document_id: str | None
    edge_document_id: str | None
    relationship: str


def admit(hop: Hop, *, workspace_id: str, resolved_document_ids: set[str]) -> bool:
    """True only when this step stays inside the workspace and the resolved documents.

    Edge document_id is honoured when Epic 5 stamps it. Until then, a Document
    hop is admitted only when that document is in scope, and a fact hop only
    when the fact's own document_id is in scope. A shared entity is not a bridge
    to an out-of-scope document.
    """
    if not workspace_id or hop.destination_workspace_id != workspace_id:
        return False
    if hop.relationship == "CONTRADICTS":
        return False
    if hop.edge_document_id is not None and hop.edge_document_id not in resolved_document_ids:
        return False
    if hop.destination_label == "Document":
        return hop.destination_document_id in resolved_document_ids
    if hop.destination_label in FACT_LABELS:
        return hop.destination_document_id in resolved_document_ids
    if hop.destination_label in _NAMED_LABELS:
        return True
    return False
