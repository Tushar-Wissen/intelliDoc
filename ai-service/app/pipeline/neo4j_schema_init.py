"""Neo4j indexes and uniqueness constraints, applied when the AI service starts.

Indexes follow the ERD indexing plan. Uniqueness constraints on
(workspace_id, normalized_name) are TASK-509: they close the concurrent MERGE
race called out in Epic 5 §15. They do not add node labels or relationships.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

SCHEMA_STATEMENTS: tuple[str, ...] = (
    """
    CREATE CONSTRAINT organization_workspace_name IF NOT EXISTS
    FOR (n:Organization)
    REQUIRE (n.workspace_id, n.normalized_name) IS UNIQUE
    """,
    """
    CREATE CONSTRAINT person_workspace_name IF NOT EXISTS
    FOR (n:Person)
    REQUIRE (n.workspace_id, n.normalized_name) IS UNIQUE
    """,
    """
    CREATE CONSTRAINT topic_workspace_name IF NOT EXISTS
    FOR (n:Topic)
    REQUIRE (n.workspace_id, n.normalized_name) IS UNIQUE
    """,
    """
    CREATE INDEX organization_workspace_name IF NOT EXISTS
    FOR (n:Organization) ON (n.workspace_id, n.normalized_name)
    """,
    """
    CREATE INDEX person_workspace_name IF NOT EXISTS
    FOR (n:Person) ON (n.workspace_id, n.normalized_name)
    """,
    """
    CREATE INDEX document_document_id IF NOT EXISTS
    FOR (n:Document) ON (n.document_id)
    """,
    """
    CREATE INDEX document_workspace_id IF NOT EXISTS
    FOR (n:Document) ON (n.workspace_id)
    """,
    """
    CREATE INDEX document_group_id IF NOT EXISTS
    FOR (n:Document) ON (n.group_id)
    """,
)


def schema_statements() -> list[str]:
    return [statement.strip() for statement in SCHEMA_STATEMENTS]


def ensure_neo4j_schema(runner=None) -> None:
    """Run each statement once. `runner` is a callable(cypher) for tests."""
    if runner is None:
        from app.pipeline.neo4j_client import get_neo4j_client

        client = get_neo4j_client()
        runner = client.execute
    for statement in schema_statements():
        logger.info("Applying Neo4j schema statement")
        runner(statement)
