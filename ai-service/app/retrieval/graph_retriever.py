"""Scope-bounded graph channel. Reads the Epic 5 graph; does not write it."""

from __future__ import annotations

import uuid
from collections import defaultdict, deque
from dataclasses import dataclass

from app.db.repository import ChunkRecord, PipelineRepository
from app.pipeline.kg import get_graph_store
from app.pipeline.kg_schema import FACT_LABELS, normalize_entity_name
from app.retrieval.config import RetrievalConfig
from app.retrieval.graph_fact_resolver import ResolvedFact, resolve_facts
from app.retrieval.graph_scope_filter import Hop, admit

_FACT_RELATIONSHIPS = frozenset({"SIGNED", "EXPIRES_ON", "AMENDS", "MENTIONS", "HAS_VALUE"})
_NAMED_LABELS = frozenset({"Organization", "Person", "Topic"})


@dataclass
class GraphChannel:
    chunks: list[ChunkRecord]
    facts: list[ResolvedFact]
    discarded: int


class GraphRetriever:
    def __init__(self, repo: PipelineRepository, store=None, config: RetrievalConfig | None = None) -> None:
        self._repo = repo
        self._store = store
        self._config = config or RetrievalConfig()

    def retrieve(
        self,
        question: str,
        rewritten_query: str,
        workspace_id: uuid.UUID,
        document_ids: list[uuid.UUID],
        question_type: str,
    ) -> GraphChannel:
        store = self._store if self._store is not None else get_graph_store()
        snapshot = store.workspace_snapshot(str(workspace_id))
        nodes = {node["node_id"]: node for node in snapshot.get("nodes", [])}
        edges = list(snapshot.get("edges", []))
        resolved = {str(document_id) for document_id in document_ids}
        admitted = _admitted_edges(
            nodes,
            edges,
            question=f"{question}\n{rewritten_query}",
            question_type=question_type,
            workspace_id=str(workspace_id),
            resolved=resolved,
            max_hops=self._config.graph_max_hops,
        )
        facts = _facts_from_edges(admitted, nodes, resolved)[: self._config.graph_max_facts]
        chunks, kept, discarded = resolve_facts(
            facts,
            workspace_id=workspace_id,
            document_ids=document_ids,
            repo=self._repo,
        )
        return GraphChannel(chunks=chunks, facts=kept, discarded=discarded)


def _admitted_edges(
    nodes: dict,
    edges: list[dict],
    *,
    question: str,
    question_type: str,
    workspace_id: str,
    resolved: set[str],
    max_hops: int,
) -> list[dict]:
    adjacency: dict[str, list[tuple[str, dict]]] = defaultdict(list)
    for edge in edges:
        adjacency[edge["start_id"]].append((edge["end_id"], edge))
        adjacency[edge["end_id"]].append((edge["start_id"], edge))
    seeds = _seeds(nodes, question, question_type, resolved)
    seen: set[str] = set()
    queue: deque[tuple[str, int]] = deque()
    for seed in seeds:
        node_id = seed["node_id"]
        if node_id in seen:
            continue
        seen.add(node_id)
        queue.append((node_id, 0))
    admitted_keys: set[tuple[str, str, str]] = set()
    while queue:
        node_id, depth = queue.popleft()
        if depth >= max_hops:
            continue
        for neighbor_id, edge in adjacency.get(node_id, []):
            neighbor = nodes.get(neighbor_id)
            if neighbor is None:
                continue
            hop = _hop(neighbor, edge)
            if not admit(hop, workspace_id=workspace_id, resolved_document_ids=resolved):
                continue
            admitted_keys.add((edge["rel_type"], edge["start_id"], edge["end_id"]))
            if neighbor_id in seen:
                continue
            seen.add(neighbor_id)
            queue.append((neighbor_id, depth + 1))
    return [
        edge
        for edge in edges
        if (edge["rel_type"], edge["start_id"], edge["end_id"]) in admitted_keys
        and edge["rel_type"] in _FACT_RELATIONSHIPS
    ]


def _seeds(nodes: dict, question: str, question_type: str, resolved: set[str]) -> list[dict]:
    normalized_question = normalize_entity_name(question)
    entity_seeds = []
    document_seeds = []
    for node in nodes.values():
        label = node.get("label")
        properties = node.get("properties") or {}
        if label in _NAMED_LABELS:
            name = properties.get("normalized_name") or ""
            if name and name in normalized_question:
                entity_seeds.append(node)
        elif label == "Document" and properties.get("document_id") in resolved:
            document_seeds.append(node)
    if question_type in {"comparison", "cross-document"} or not entity_seeds:
        return entity_seeds + document_seeds
    return entity_seeds


def _hop(neighbor: dict, edge: dict) -> Hop:
    properties = neighbor.get("properties") or {}
    return Hop(
        destination_workspace_id=properties.get("workspace_id"),
        destination_label=neighbor.get("label") or "",
        destination_document_id=properties.get("document_id"),
        edge_document_id=edge.get("document_id"),
        relationship=edge.get("rel_type") or "",
    )


def _facts_from_edges(edges: list[dict], nodes: dict, resolved: set[str]) -> list[ResolvedFact]:
    facts: list[ResolvedFact] = []
    for edge in edges:
        fact = _one_fact(edge, nodes, resolved)
        if fact is not None:
            facts.append(fact)
    return facts


def _one_fact(edge: dict, nodes: dict, resolved: set[str]) -> ResolvedFact | None:
    start = nodes.get(edge["start_id"])
    end = nodes.get(edge["end_id"])
    if start is None or end is None:
        return None
    relationship = edge["rel_type"]
    if relationship in {"EXPIRES_ON", "HAS_VALUE"}:
        fact_node = end if end.get("label") in FACT_LABELS else start
        document = start if start.get("label") == "Document" else end
        return _fact_node_fact(fact_node, document, relationship, resolved)
    if relationship == "SIGNED":
        document = end if end.get("label") == "Document" else start
        organization = start if start.get("label") == "Organization" else end
        return _document_endpoint_fact(
            document,
            fact_type="Organization",
            subject=_name(organization),
            relationship="SIGNED",
            obj=_title(document),
            resolved=resolved,
        )
    if relationship == "MENTIONS":
        document = start if start.get("label") == "Document" else end
        entity = end if start.get("label") == "Document" else start
        return _document_endpoint_fact(
            document,
            fact_type=entity.get("label") or "Topic",
            subject=_title(document),
            relationship="MENTIONS",
            obj=_name(entity),
            resolved=resolved,
        )
    if relationship == "AMENDS":
        if start.get("label") != "Document" or end.get("label") != "Document":
            return None
        start_id = (start.get("properties") or {}).get("document_id")
        end_id = (end.get("properties") or {}).get("document_id")
        if start_id not in resolved or end_id not in resolved:
            return None
        properties = start.get("properties") or {}
        return ResolvedFact(
            fact_type="Document",
            subject=_title(start),
            relationship="AMENDS",
            object=_title(end),
            document_id=str(start_id),
            source_chunk_id=properties.get("source_chunk_id"),
            source_page=properties.get("source_page"),
        )
    return None


def _fact_node_fact(fact_node: dict, document: dict, relationship: str, resolved: set[str]) -> ResolvedFact | None:
    properties = fact_node.get("properties") or {}
    document_id = properties.get("document_id") or (document.get("properties") or {}).get("document_id")
    if document_id not in resolved:
        return None
    return ResolvedFact(
        fact_type=fact_node.get("label") or relationship,
        subject=_title(document),
        relationship=relationship,
        object=str(properties.get("value") or ""),
        document_id=str(document_id),
        source_chunk_id=properties.get("source_chunk_id"),
        source_page=properties.get("source_page"),
    )


def _document_endpoint_fact(
    document: dict,
    *,
    fact_type: str,
    subject: str,
    relationship: str,
    obj: str,
    resolved: set[str],
) -> ResolvedFact | None:
    properties = document.get("properties") or {}
    document_id = properties.get("document_id")
    if document.get("label") != "Document" or document_id not in resolved:
        return None
    return ResolvedFact(
        fact_type=fact_type,
        subject=subject,
        relationship=relationship,
        object=obj,
        document_id=str(document_id),
        source_chunk_id=properties.get("source_chunk_id"),
        source_page=properties.get("source_page"),
    )


def _title(node: dict) -> str:
    properties = node.get("properties") or {}
    return str(properties.get("title") or properties.get("document_id") or "")


def _name(node: dict) -> str:
    properties = node.get("properties") or {}
    return str(properties.get("name") or properties.get("normalized_name") or "")
