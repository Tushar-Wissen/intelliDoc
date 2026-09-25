"""Neo4j driver and graph store. Writes go through MERGE Cypher only."""

from __future__ import annotations

import logging
import uuid
from typing import Any

from app.config import settings
from app.pipeline.kg_schema import (
    FACT_LABELS,
    NAMED_ENTITY_LABELS,
    RELATIONSHIP_TYPES,
    normalize_entity_name,
    resolve_entity_cypher,
)

logger = logging.getLogger(__name__)

_driver = None
_client = None

_DATE_FACT_CYPHER = (
    "MERGE (n:DateFact {workspace_id: $workspace_id, document_id: $document_id, "
    "label: $label, value: $value}) "
    "ON CREATE SET n.node_id = $node_id, n.source_chunk_id = $source_chunk_id, "
    "n.source_page = $source_page "
    "RETURN n.node_id AS node_id"
)
_AMOUNT_CYPHER = (
    "MERGE (n:Amount {workspace_id: $workspace_id, document_id: $document_id, "
    "label: $label, value: $value, currency: $currency}) "
    "ON CREATE SET n.node_id = $node_id, n.source_chunk_id = $source_chunk_id, "
    "n.source_page = $source_page "
    "RETURN n.node_id AS node_id"
)
_DOCUMENT_CYPHER = (
    "MERGE (n:Document {document_id: $document_id}) "
    "ON CREATE SET n.node_id = $node_id, n.workspace_id = $workspace_id, "
    "n.group_id = $group_id, n.title = $title, n.document_type = $document_type, "
    "n.source_chunk_id = $source_chunk_id, n.source_page = $source_page "
    "ON MATCH SET n.group_id = $group_id, n.title = $title, "
    "n.document_type = $document_type "
    "RETURN n.node_id AS node_id, n.workspace_id AS workspace_id"
)

_SCOPE_CYPHER = """
MATCH (a)-[:CONTRADICTS]-(b)
WHERE a.workspace_id = $workspace_id
  AND b.workspace_id = $workspace_id
  AND a.document_id IN $resolved_document_ids
  AND b.document_id IN $resolved_document_ids
RETURN a.node_id AS left_node_id, b.node_id AS right_node_id,
       a.label AS label, a.value AS left_value, b.value AS right_value,
       head(labels(a)) AS fact_type,
       a.document_id AS left_document_id, b.document_id AS right_document_id,
       a.source_page AS left_source_page, b.source_page AS right_source_page,
       a.source_chunk_id AS left_source_chunk_id,
       b.source_chunk_id AS right_source_chunk_id,
       a.workspace_id AS workspace_id
"""

_ISOLATION_CYPHER = """
MATCH path = (a)-[*]-(b)
WHERE a.workspace_id <> b.workspace_id
RETURN count(path) AS path_count
"""

CONTRADICTION_WRITE_CYPHER = """
MATCH (d:Document {document_id: $document_id, workspace_id: $workspace_id})
MATCH (d)-[:AMENDS*0..5]-(other:Document {workspace_id: $workspace_id})
MATCH (d)-[:EXPIRES_ON|HAS_VALUE]->(a)
MATCH (other)-[:EXPIRES_ON|HAS_VALUE]->(b)
WHERE a.workspace_id = $workspace_id
  AND b.workspace_id = $workspace_id
  AND a.label = b.label
  AND a.value <> b.value
  AND a.node_id < b.node_id
MERGE (a)-[:CONTRADICTS]->(b)
RETURN a.node_id AS left_node_id, b.node_id AS right_node_id
"""


class Neo4jClient:
    def execute(self, cypher: str, parameters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        driver = get_driver()

        def _work(tx):
            result = tx.run(cypher, parameters or {})
            return [record.data() for record in result]

        with driver.session() as session:
            return session.execute_write(_work)

    def execute_read(self, cypher: str, parameters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        driver = get_driver()

        def _work(tx):
            result = tx.run(cypher, parameters or {})
            return [record.data() for record in result]

        with driver.session() as session:
            return session.execute_read(_work)


def get_neo4j_client() -> Neo4jClient:
    global _client
    if _client is None:
        _client = Neo4jClient()
    return _client


def get_driver():
    global _driver
    if _driver is None:
        from neo4j import GraphDatabase

        _driver = GraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password),
            connection_timeout=2.0,
        )
    return _driver


def close_driver() -> None:
    global _driver, _client
    if _driver is not None:
        _driver.close()
    _driver = None
    _client = None


class Neo4jGraphStore:
    """Production store. Every write includes workspace_id and uses MERGE."""

    def __init__(self, client: Neo4jClient | None = None) -> None:
        self._client = client or get_neo4j_client()

    def execute(self, cypher: str, parameters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        return self._client.execute(cypher, parameters)

    def workspace_snapshot(self, workspace_id: str) -> dict[str, Any]:
        """Read-only workspace graph for Epic 6. Does not follow edges outside the workspace."""
        nodes = self._client.execute_read(
            """
            MATCH (n)
            WHERE n.workspace_id = $workspace_id
            RETURN n.node_id AS node_id, head(labels(n)) AS label, properties(n) AS properties
            """,
            {"workspace_id": workspace_id},
        )
        edges = self._client.execute_read(
            """
            MATCH (a)-[r]->(b)
            WHERE a.workspace_id = $workspace_id AND b.workspace_id = $workspace_id
            RETURN type(r) AS rel_type, a.node_id AS start_id, b.node_id AS end_id,
                   r.document_id AS document_id, r.source_chunk_id AS source_chunk_id,
                   r.source_page AS source_page
            """,
            {"workspace_id": workspace_id},
        )
        return {"nodes": nodes, "edges": edges}

    def merge_document(
        self,
        *,
        document_id: str,
        workspace_id: str,
        group_id: str | None,
        title: str,
        document_type: str | None,
        source_chunk_id: str | None,
        source_page: int | None,
    ) -> str:
        rows = self.execute(
            _DOCUMENT_CYPHER,
            {
                "document_id": document_id,
                "workspace_id": workspace_id,
                "group_id": group_id,
                "title": title,
                "document_type": document_type,
                "source_chunk_id": source_chunk_id,
                "source_page": source_page,
                "node_id": str(uuid.uuid4()),
            },
        )
        if not rows:
            raise RuntimeError("Document MERGE returned no node")
        existing_workspace = rows[0].get("workspace_id")
        if existing_workspace and existing_workspace != workspace_id:
            raise RuntimeError("Refusing to attach a document node from another workspace")
        return rows[0]["node_id"]

    def resolve_named_entity(
        self,
        *,
        workspace_id: str,
        entity_type: str,
        name: str,
        document_id: str,
        source_chunk_id: str,
        source_page: int | None,
    ) -> tuple[str, bool]:
        if not workspace_id:
            raise RuntimeError("workspace_id is required")
        if entity_type not in NAMED_ENTITY_LABELS:
            raise RuntimeError(f"Unsupported entity type: {entity_type}")
        normalized = normalize_entity_name(name)
        cypher = resolve_entity_cypher(entity_type)
        node_id = str(uuid.uuid4())
        rows = self.execute(
            cypher,
            {
                "workspace_id": workspace_id,
                "normalized_name": normalized,
                "name": name.strip(),
                "document_id": document_id,
                "source_chunk_id": source_chunk_id,
                "source_page": source_page,
                "node_id": node_id,
            },
        )
        resolved = rows[0]["node_id"] if rows else node_id
        created = resolved == node_id
        logger.info(
            "Entity resolution workspaceId=%s type=%s normalized=%s created=%s",
            workspace_id,
            entity_type,
            normalized,
            created,
        )
        return resolved, created

    def merge_date_fact(self, **params: Any) -> str:
        return self._merge_fact(_DATE_FACT_CYPHER, params)

    def merge_amount(self, **params: Any) -> str:
        return self._merge_fact(_AMOUNT_CYPHER, params)

    def _merge_fact(self, cypher: str, params: dict[str, Any]) -> str:
        if not params.get("workspace_id"):
            raise RuntimeError("workspace_id is required")
        params = dict(params)
        params.setdefault("node_id", str(uuid.uuid4()))
        rows = self.execute(cypher, params)
        return rows[0]["node_id"]

    def merge_relationship(
        self,
        *,
        workspace_id: str,
        rel_type: str,
        start_id: str,
        end_id: str,
    ) -> None:
        if rel_type not in RELATIONSHIP_TYPES and rel_type != "CONTRADICTS":
            raise RuntimeError(f"Unsupported relationship: {rel_type}")
        cypher = (
            "MATCH (a {node_id: $start_id}), (b {node_id: $end_id}) "
            "WHERE a.workspace_id = $workspace_id AND b.workspace_id = $workspace_id "
            f"MERGE (a)-[:{rel_type}]->(b)"
        )
        self.execute(
            cypher,
            {"workspace_id": workspace_id, "start_id": start_id, "end_id": end_id},
        )

    def find_document_node_ids_by_title(self, workspace_id: str, title_query: str) -> list[str]:
        rows = self.execute(
            """
            MATCH (n:Document {workspace_id: $workspace_id})
            RETURN n.node_id AS node_id, n.title AS title, n.document_id AS document_id
            """,
            {"workspace_id": workspace_id},
        )
        needle = normalize_entity_name(title_query)
        matched: list[str] = []
        for row in rows:
            title = normalize_entity_name(row.get("title") or "")
            stem = title.rsplit(".", 1)[0]
            if needle and (needle == title or needle == stem or needle in stem or stem in needle):
                matched.append(row["node_id"])
        return matched

    def related_document_ids(self, document_id: str, workspace_id: str) -> set[str]:
        rows = self.execute(
            """
            MATCH (d:Document {document_id: $document_id, workspace_id: $workspace_id})
            MATCH (d)-[:AMENDS*0..5]-(other:Document {workspace_id: $workspace_id})
            RETURN DISTINCT other.document_id AS document_id
            """,
            {"document_id": document_id, "workspace_id": workspace_id},
        )
        found = {row["document_id"] for row in rows}
        found.add(document_id)
        return found

    def facts_for_document(self, document_id: str, workspace_id: str) -> list[dict[str, Any]]:
        rows = self.execute(
            """
            MATCH (d:Document {document_id: $document_id, workspace_id: $workspace_id})
            MATCH (d)-[:EXPIRES_ON|HAS_VALUE]->(fact)
            WHERE fact.workspace_id = $workspace_id
            RETURN fact.node_id AS node_id, fact.label AS label, fact.value AS value,
                   fact.document_id AS document_id, fact.workspace_id AS workspace_id,
                   fact.source_page AS source_page, fact.source_chunk_id AS source_chunk_id,
                   head([l IN labels(fact) WHERE l IN ['DateFact', 'Amount']]) AS fact_type
            """,
            {"document_id": document_id, "workspace_id": workspace_id},
        )
        return [row for row in rows if row.get("fact_type") in FACT_LABELS]

    def merge_contradiction(self, workspace_id: str, left_node_id: str, right_node_id: str) -> None:
        self.execute(
            """
            MATCH (a {node_id: $left_id}), (b {node_id: $right_id})
            WHERE a.workspace_id = $workspace_id AND b.workspace_id = $workspace_id
            MERGE (a)-[:CONTRADICTS]->(b)
            """,
            {
                "workspace_id": workspace_id,
                "left_id": left_node_id,
                "right_id": right_node_id,
            },
        )

    def contradictions_in_scope(
        self,
        workspace_id: str,
        document_ids: list[str],
    ) -> list[dict[str, Any]]:
        if not document_ids:
            return []
        return self.execute(
            _SCOPE_CYPHER,
            {"workspace_id": workspace_id, "resolved_document_ids": document_ids},
        )

    def cross_workspace_path_count(self) -> int:
        rows = self.execute(_ISOLATION_CYPHER)
        if not rows:
            return 0
        return int(rows[0].get("path_count") or 0)

    def counts_for_document(self, document_id: str, workspace_id: str) -> tuple[int, int]:
        rows = self.execute(
            """
            MATCH (d:Document {document_id: $document_id, workspace_id: $workspace_id})
            OPTIONAL MATCH (d)-[rel]-(neighbor)
            WHERE neighbor.workspace_id = $workspace_id
            WITH d, collect(DISTINCT neighbor) AS neighbors, collect(DISTINCT rel) AS rels
            RETURN 1 + size([n IN neighbors WHERE n IS NOT NULL]) AS node_count,
                   size([r IN rels WHERE r IS NOT NULL]) AS edge_count
            """,
            {"document_id": document_id, "workspace_id": workspace_id},
        )
        if not rows:
            return (0, 0)
        return (int(rows[0]["node_count"]), int(rows[0]["edge_count"]))

    def named_entities(
        self,
        workspace_id: str,
        label: str,
        normalized_name: str | None = None,
    ) -> list[dict[str, Any]]:
        if label not in NAMED_ENTITY_LABELS:
            raise RuntimeError(f"Unsupported entity type: {label}")
        cypher = (
            f"MATCH (n:{label} {{workspace_id: $workspace_id}}) "
            "WHERE $normalized_name IS NULL OR n.normalized_name = $normalized_name "
            "RETURN n.node_id AS node_id, n.name AS name, n.normalized_name AS normalized_name, "
            "n.workspace_id AS workspace_id, n.document_id AS document_id, "
            "n.source_chunk_id AS source_chunk_id, n.source_page AS source_page"
        )
        return self.execute(
            cypher,
            {"workspace_id": workspace_id, "normalized_name": normalized_name},
        )

    def write_detected_contradictions(self, document_id: str, workspace_id: str) -> list[dict[str, Any]]:
        """Single Cypher pass used by Neo4j. In-memory stores implement the same rule in Python."""
        return self.execute(
            CONTRADICTION_WRITE_CYPHER,
            {"document_id": document_id, "workspace_id": workspace_id},
        )
