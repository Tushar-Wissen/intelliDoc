"""SimpleKGPipeline schema for Epic 5.

Lexical-graph chunk nodes are disabled (Decision B). Chunk text stays in
Postgres. Provenance is `source_chunk_id` / `source_page` on each fact node.
`CONTRADICTS` is not part of extraction; Story 5.4 writes it in a later pass.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

logger = logging.getLogger(__name__)

NODE_LABELS: tuple[str, ...] = (
    "Organization",
    "Person",
    "DateFact",
    "Amount",
    "Topic",
    "Document",
)
# Extraction relationships only. CONTRADICTS is Story 5.4.
RELATIONSHIP_TYPES: tuple[str, ...] = (
    "SIGNED",
    "EXPIRES_ON",
    "AMENDS",
    "MENTIONS",
    "HAS_VALUE",
)
NAMED_ENTITY_LABELS: frozenset[str] = frozenset({"Organization", "Person", "Topic"})
FACT_LABELS: frozenset[str] = frozenset({"DateFact", "Amount"})

PATTERNS: tuple[tuple[str, str, str], ...] = (
    ("Organization", "SIGNED", "Document"),
    ("Document", "EXPIRES_ON", "DateFact"),
    ("Document", "AMENDS", "Document"),
    ("Document", "MENTIONS", "Person"),
    ("Document", "MENTIONS", "Organization"),
    ("Document", "MENTIONS", "Topic"),
    ("Document", "HAS_VALUE", "Amount"),
)


@dataclass(frozen=True)
class SimpleKGPipelineSettings:
    """Arguments that keep SimpleKGPipeline inside the approved graph schema."""

    lexical_graph_enabled: bool = False
    perform_entity_resolution: bool = False
    from_file: bool = False
    on_error: str = "IGNORE"
    node_labels: tuple[str, ...] = NODE_LABELS
    relationship_types: tuple[str, ...] = RELATIONSHIP_TYPES
    patterns: tuple[tuple[str, str, str], ...] = PATTERNS


def simple_kg_pipeline_config() -> SimpleKGPipelineSettings:
    return SimpleKGPipelineSettings()


def normalize_entity_name(name: str) -> str:
    """Baseline normalization: trim, lowercase, collapse internal whitespace.

    Legal-suffix stripping is intentionally not applied (Epic 5 §27).
    """
    from app.config import settings

    strategy = (settings.kg_entity_normalization_strategy or "baseline").strip().lower()
    if strategy != "baseline":
        logger.warning(
            "Unknown KG_ENTITY_NORMALIZATION_STRATEGY=%s; using baseline",
            strategy,
        )
    return re.sub(r"\s+", " ", name.strip().lower())


def resolve_entity_cypher(entity_type: str) -> str:
    """MERGE keyed on (workspace_id, normalized_name). Never name alone.

    The label is interpolated only after a whitelist check. Callers cannot
    omit workspace_id: it is a required Cypher parameter.
    """
    if entity_type not in NAMED_ENTITY_LABELS:
        raise ValueError(f"Unsupported named entity label: {entity_type}")
    return (
        f"MERGE (n:{entity_type} {{workspace_id: $workspace_id, normalized_name: $normalized_name}}) "
        "ON CREATE SET n.node_id = $node_id, n.name = $name, "
        "n.document_id = $document_id, n.source_chunk_id = $source_chunk_id, "
        "n.source_page = $source_page "
        "RETURN n.node_id AS node_id"
    )


def build_simple_kg_pipeline(llm, driver, writer, embedder):
    """Construct SimpleKGPipeline with lexical-graph creation left off.

    Imported lazily so unit tests do not require neo4j-graphrag. Entity
    resolution stays in `resolve_entity` (perform_entity_resolution=False)
    because the library resolver matches on name alone.
    """
    config = simple_kg_pipeline_config()
    if config.lexical_graph_enabled:
        raise RuntimeError("Lexical graph chunk creation must stay disabled")
    from neo4j_graphrag.experimental.pipeline.kg_builder import SimpleKGPipeline

    return SimpleKGPipeline(
        llm=llm,
        driver=driver,
        embedder=embedder,
        entities=list(config.node_labels),
        relations=list(config.relationship_types),
        potential_schema=list(config.patterns),
        from_file=False,
        kg_writer=writer,
        on_error=config.on_error,
        perform_entity_resolution=False,
        lexical_graph_config=None,
    )


def assert_merge_only(cypher: str) -> None:
    """BR-502: graph writes use MERGE. ON CREATE SET is the allowed exception."""
    without_on_create = re.sub(r"ON CREATE SET", "", cypher, flags=re.IGNORECASE)
    if re.search(r"\bCREATE\b", without_on_create):
        raise ValueError("Cypher uses bare CREATE")
    if "MERGE" not in cypher.upper():
        raise ValueError("Cypher does not MERGE")
    if "$workspace_id" not in cypher:
        raise ValueError("Cypher is missing workspace_id")
