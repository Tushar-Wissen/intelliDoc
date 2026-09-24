"""Knowledge-graph construction (Epic 5).

`build_knowledge_graph` extracts entities and relationships for one document
and writes them with MERGE, scoped by an explicit workspace_id (BR-501–503).
`detect_contradictions` writes CONTRADICTS edges inside that workspace only
(BR-504). Query-time scope filtering is `contradictions_in_scope` for Epic 6/7.
"""

from __future__ import annotations

import logging
import re
import uuid
from dataclasses import dataclass, field

from app.db.repository import ExtractedFieldRecord, PipelineRepository, get_repository
from app.pipeline.kg_schema import NAMED_ENTITY_LABELS, normalize_entity_name

logger = logging.getLogger(__name__)

_graph_store = None

_PARTY_SPLIT = re.compile(r",|\band\b", re.I)
_ORG = re.compile(
    r"\b([A-Z][A-Za-z0-9&'.-]*(?:\s+[A-Z][A-Za-z0-9&'.-]*)*\s+(?:Corp|Ltd|LLC|Inc)\.?)\b"
)
_ISO_DATE = re.compile(r"\b(\d{4}-\d{2}-\d{2})\b")
_SIGNED_BY = re.compile(
    r"(?:signed by|signatory|policy owner)\s*[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)",
    re.I,
)
_AMENDS = re.compile(r"\bamends\s+([A-Za-z0-9][A-Za-z0-9 ._-]{2,80})", re.I)
_DATE_FIELD = re.compile(r"date|expir|effective", re.I)
_AMOUNT_FIELD = re.compile(r"amount|price|revenue|ebitda|value", re.I)
_AMENDS_FIELD = re.compile(r"^amends$|amendment of", re.I)


class GraphBuildError(Exception):
    """Precondition failure or Neo4j write failure. Fails the document."""


@dataclass
class EntityCandidate:
    kind: str
    name: str
    rel_type: str
    fact_label: str = ""
    value: str = ""
    currency: str = ""


@dataclass
class ExtractionBatch:
    entities: list[EntityCandidate] = field(default_factory=list)
    amends_titles: list[str] = field(default_factory=list)


@dataclass
class Contradiction:
    fact_type: str
    label: str
    left_value: str
    right_value: str
    left_document_id: str
    right_document_id: str
    left_source_page: int | None
    right_source_page: int | None
    left_source_chunk_id: str | None
    right_source_chunk_id: str | None
    workspace_id: str


def get_graph_store():
    global _graph_store
    if _graph_store is None:
        from app.pipeline.neo4j_client import Neo4jGraphStore

        _graph_store = Neo4jGraphStore()
    return _graph_store


def set_graph_store(store) -> None:
    global _graph_store
    _graph_store = store


def build_knowledge_graph(
    document_id: uuid.UUID,
    workspace_id: uuid.UUID,
    *,
    repo: PipelineRepository | None = None,
    extractor=None,
    store=None,
) -> None:
    """Extract and write one document's graph. workspace_id is never inferred."""
    workspace_key = _require_workspace_id(workspace_id)
    document_key = str(document_id)
    repo = repo or get_repository()
    store = store or get_graph_store()
    extractor = extractor or RulesKgExtractor()

    document = repo.get_document(document_id)
    if document is None:
        raise GraphBuildError(f"Document {document_id} was not found")
    if document.workspace_id is not None and document.workspace_id != workspace_id:
        raise GraphBuildError("workspace_id does not match the document")

    chunks = [chunk for chunk in repo.list_chunks(document_id) if chunk.chunk_text.strip()]
    fields = repo.list_extracted_fields(document_id)
    source_chunk_id = str(chunks[0].id) if chunks else None
    source_page = chunks[0].page_number if chunks else None
    document_node_id = store.merge_document(
        document_id=document_key,
        workspace_id=workspace_key,
        group_id=str(document.group_id) if document.group_id else None,
        title=document.file_name,
        document_type=document.document_type,
        source_chunk_id=source_chunk_id,
        source_page=source_page,
    )

    counts: dict[str, int] = {}
    edge_counts: dict[str, int] = {}
    for chunk in chunks:
        chunk_fields = [item for item in fields if item.source_chunk_id == chunk.id]
        try:
            batch = extractor.extract(chunk.chunk_text, chunk_fields)
        except Exception:
            logger.exception(
                "Chunk extraction failed documentId=%s chunkId=%s; continuing",
                document_id,
                chunk.id,
            )
            continue
        written = _write_batch(
            store,
            batch,
            workspace_id=workspace_key,
            document_id=document_key,
            document_node_id=document_node_id,
            source_chunk_id=str(chunk.id),
            source_page=chunk.page_number,
        )
        for label, count in written[0].items():
            counts[label] = counts.get(label, 0) + count
        for rel_type, count in written[1].items():
            edge_counts[rel_type] = edge_counts.get(rel_type, 0) + count

    logger.info(
        "Knowledge graph built documentId=%s workspaceId=%s entities=%s edges=%s",
        document_id,
        workspace_id,
        counts,
        edge_counts,
    )


def resolve_entity(
    workspace_id: uuid.UUID,
    entity_type: str,
    name: str,
    *,
    document_id: uuid.UUID,
    source_chunk_id: uuid.UUID,
    source_page: int | None = None,
    store=None,
) -> str:
    """BR-503. workspace_id is a required parameter, not an optional filter."""
    if entity_type not in NAMED_ENTITY_LABELS:
        raise GraphBuildError(f"Unsupported entity type: {entity_type}")
    if not name or not name.strip():
        raise GraphBuildError("Entity name is required")
    workspace_key = _require_workspace_id(workspace_id)
    store = store or get_graph_store()
    node_id, _created = store.resolve_named_entity(
        workspace_id=workspace_key,
        entity_type=entity_type,
        name=name,
        document_id=str(document_id),
        source_chunk_id=str(source_chunk_id),
        source_page=source_page,
    )
    return node_id


def detect_contradictions(
    document_id: uuid.UUID,
    workspace_id: uuid.UUID,
    *,
    store=None,
) -> list[Contradiction]:
    """Write CONTRADICTS edges for conflicting DateFact/Amount values in one workspace."""
    workspace_key = _require_workspace_id(workspace_id)
    document_key = str(document_id)
    store = store or get_graph_store()
    related = store.related_document_ids(document_key, workspace_key)
    grouped: dict[tuple[str, str], list[dict]] = {}
    for related_id in related:
        for fact in store.facts_for_document(related_id, workspace_key):
            if fact.get("workspace_id") != workspace_key:
                continue
            if fact.get("fact_type") not in {"DateFact", "Amount"}:
                continue
            grouped.setdefault((fact["fact_type"], fact["label"]), []).append(fact)

    found: list[Contradiction] = []
    for (fact_type, label), facts in grouped.items():
        for index, left in enumerate(facts):
            for right in facts[index + 1 :]:
                if left["value"] == right["value"]:
                    continue
                if left["document_id"] != document_key and right["document_id"] != document_key:
                    continue
                first, second = left, right
                if first["node_id"] > second["node_id"]:
                    first, second = second, first
                store.merge_contradiction(workspace_key, first["node_id"], second["node_id"])
                found.append(_contradiction(fact_type, label, first, second, workspace_key))
    logger.info(
        "Contradictions documentId=%s workspaceId=%s count=%s",
        document_id,
        workspace_id,
        len(found),
    )
    return found


def contradictions_in_scope(
    workspace_id: uuid.UUID,
    resolved_document_ids: list[uuid.UUID],
    *,
    store=None,
) -> list[Contradiction]:
    """Query-time filter for Epic 6/7. Both facts must sit inside the resolved scope."""
    workspace_key = _require_workspace_id(workspace_id)
    allowed = {str(document_id) for document_id in resolved_document_ids}
    store = store or get_graph_store()
    rows = store.contradictions_in_scope(workspace_key, list(allowed))
    results: list[Contradiction] = []
    for row in rows:
        if row.get("workspace_id") != workspace_key:
            continue
        if row.get("left_document_id") not in allowed or row.get("right_document_id") not in allowed:
            continue
        results.append(
            Contradiction(
                fact_type=row.get("fact_type") or "",
                label=row.get("label") or "",
                left_value=row.get("left_value") or "",
                right_value=row.get("right_value") or "",
                left_document_id=row["left_document_id"],
                right_document_id=row["right_document_id"],
                left_source_page=row.get("left_source_page"),
                right_source_page=row.get("right_source_page"),
                left_source_chunk_id=row.get("left_source_chunk_id"),
                right_source_chunk_id=row.get("right_source_chunk_id"),
                workspace_id=workspace_key,
            )
        )
    return results


class RulesKgExtractor:
    """Schema-guided extractor for LLM_PROVIDER=rules and for tests.

    Uses Epic 3 extracted fields as the head start, then the chunk text for
    entities those fields did not already name. Ollama/hosted runs use the
    same candidate shape; SimpleKGPipeline is configured in kg_schema and is
    not invoked on the rules path.
    """

    def extract(self, text: str, fields: list[ExtractedFieldRecord]) -> ExtractionBatch:
        batch = ExtractionBatch()
        seen: set[tuple[str, str, str]] = set()

        def add(candidate: EntityCandidate) -> None:
            key = (candidate.kind, normalize_entity_name(candidate.name or candidate.value), candidate.fact_label)
            if key in seen:
                return
            seen.add(key)
            batch.entities.append(candidate)

        for item in fields:
            self._from_field(item, add, batch)
        self._from_text(text, add, batch)
        return batch


    def _from_field(self, item: ExtractedFieldRecord, add, batch: ExtractionBatch) -> None:
        name = item.field_name.strip()
        value = item.field_value.strip()
        if _AMENDS_FIELD.search(name):
            batch.amends_titles.append(value)
            return
        if name.lower() == "parties":
            for party in _split_parties(value):
                add(EntityCandidate(kind="Organization", name=party, rel_type="SIGNED"))
            return
        if name.lower() == "topics":
            for topic in _split_parties(value):
                add(EntityCandidate(kind="Topic", name=topic, rel_type="MENTIONS"))
            return
        if name.lower() in {"policy owner", "signatory"}:
            add(EntityCandidate(kind="Person", name=value, rel_type="MENTIONS"))
            return
        if name.lower() == "customer":
            add(EntityCandidate(kind="Organization", name=value, rel_type="MENTIONS"))
            return
        if _DATE_FIELD.search(name):
            match = _ISO_DATE.search(value)
            if match:
                add(
                    EntityCandidate(
                        kind="DateFact",
                        name=match.group(1),
                        rel_type="EXPIRES_ON",
                        fact_label=_canonical_date_label(name),
                        value=match.group(1),
                    )
                )
            return
        if _AMOUNT_FIELD.search(name):
            number, currency = _parse_amount(value)
            if number:
                add(
                    EntityCandidate(
                        kind="Amount",
                        name=number,
                        rel_type="HAS_VALUE",
                        fact_label=_amount_label(name, value),
                        value=number,
                        currency=currency,
                    )
                )

    def _from_text(self, text: str, add, batch: ExtractionBatch) -> None:
        for match in _ORG.finditer(text):
            add(EntityCandidate(kind="Organization", name=match.group(1).rstrip("."), rel_type="MENTIONS"))
        for match in _SIGNED_BY.finditer(text):
            add(EntityCandidate(kind="Person", name=match.group(1).strip(), rel_type="MENTIONS"))
        for match in _AMENDS.finditer(text):
            title = match.group(1).strip(" .")
            if title not in batch.amends_titles:
                batch.amends_titles.append(title)
        for label, raw in re.findall(
            r"(expiry date|expiration date|effective date)\s*[:\s]+(\d{4}-\d{2}-\d{2})",
            text,
            flags=re.I,
        ):
            add(
                EntityCandidate(
                    kind="DateFact",
                    name=raw,
                    rel_type="EXPIRES_ON",
                    fact_label=_canonical_date_label(label),
                    value=raw,
                )
            )


def _write_batch(
    store,
    batch: ExtractionBatch,
    *,
    workspace_id: str,
    document_id: str,
    document_node_id: str,
    source_chunk_id: str,
    source_page: int | None,
) -> tuple[dict[str, int], dict[str, int]]:
    entity_counts: dict[str, int] = {}
    edge_counts: dict[str, int] = {}
    try:
        for candidate in batch.entities:
            node_id = _write_entity(
                store,
                candidate,
                workspace_id=workspace_id,
                document_id=document_id,
                source_chunk_id=source_chunk_id,
                source_page=source_page,
            )
            entity_counts[candidate.kind] = entity_counts.get(candidate.kind, 0) + 1
            _link_entity(
                store,
                candidate,
                workspace_id=workspace_id,
                document_node_id=document_node_id,
                entity_node_id=node_id,
            )
            edge_counts[candidate.rel_type] = edge_counts.get(candidate.rel_type, 0) + 1
        for title in batch.amends_titles:
            for other_id in store.find_document_node_ids_by_title(workspace_id, title):
                if other_id == document_node_id:
                    continue
                store.merge_relationship(
                    workspace_id=workspace_id,
                    rel_type="AMENDS",
                    start_id=document_node_id,
                    end_id=other_id,
                )
                edge_counts["AMENDS"] = edge_counts.get("AMENDS", 0) + 1
    except GraphBuildError:
        raise
    except Exception as exc:
        raise GraphBuildError("Knowledge graph write failed") from exc
    return entity_counts, edge_counts


def _write_entity(
    store,
    candidate: EntityCandidate,
    *,
    workspace_id: str,
    document_id: str,
    source_chunk_id: str,
    source_page: int | None,
) -> str:
    if candidate.kind in NAMED_ENTITY_LABELS:
        node_id, _created = store.resolve_named_entity(
            workspace_id=workspace_id,
            entity_type=candidate.kind,
            name=candidate.name,
            document_id=document_id,
            source_chunk_id=source_chunk_id,
            source_page=source_page,
        )
        return node_id
    if candidate.kind == "DateFact":
        return store.merge_date_fact(
            workspace_id=workspace_id,
            document_id=document_id,
            label=candidate.fact_label,
            value=candidate.value,
            source_chunk_id=source_chunk_id,
            source_page=source_page,
        )
    if candidate.kind == "Amount":
        return store.merge_amount(
            workspace_id=workspace_id,
            document_id=document_id,
            label=candidate.fact_label,
            value=candidate.value,
            currency=candidate.currency,
            source_chunk_id=source_chunk_id,
            source_page=source_page,
        )
    raise GraphBuildError(f"Unsupported entity kind: {candidate.kind}")


def _link_entity(
    store,
    candidate: EntityCandidate,
    *,
    workspace_id: str,
    document_node_id: str,
    entity_node_id: str,
) -> None:
    if candidate.rel_type == "SIGNED":
        start_id, end_id = entity_node_id, document_node_id
    else:
        start_id, end_id = document_node_id, entity_node_id
    store.merge_relationship(
        workspace_id=workspace_id,
        rel_type=candidate.rel_type,
        start_id=start_id,
        end_id=end_id,
    )


def _contradiction(
    fact_type: str,
    label: str,
    first: dict,
    second: dict,
    workspace_id: str,
) -> Contradiction:
    return Contradiction(
        fact_type=fact_type,
        label=label,
        left_value=first["value"],
        right_value=second["value"],
        left_document_id=first["document_id"],
        right_document_id=second["document_id"],
        left_source_page=first.get("source_page"),
        right_source_page=second.get("source_page"),
        left_source_chunk_id=first.get("source_chunk_id"),
        right_source_chunk_id=second.get("source_chunk_id"),
        workspace_id=workspace_id,
    )


def _require_workspace_id(workspace_id: uuid.UUID) -> str:
    if not isinstance(workspace_id, uuid.UUID):
        raise GraphBuildError("workspace_id is required")
    return str(workspace_id)


def _split_parties(value: str) -> list[str]:
    return [part.strip(" .") for part in _PARTY_SPLIT.split(value) if part.strip(" .")]


def _canonical_date_label(name: str) -> str:
    lower = name.strip().lower()
    if "expir" in lower:
        return "expiry date"
    if "effective" in lower:
        return "effective date"
    return lower


def _amount_label(field_name: str, value: str) -> str:
    if ":" in value:
        prefix = value.split(":", 1)[0].strip()
        if prefix and not prefix[0].isdigit() and "$" not in prefix and "₹" not in prefix:
            return prefix.lower()
    return field_name.strip().lower()


def _parse_amount(value: str) -> tuple[str, str]:
    upper = value.upper()
    if "₹" in value or "INR" in upper:
        currency = "INR"
    elif "$" in value or "USD" in upper:
        currency = "USD"
    elif "€" in value or "EUR" in upper:
        currency = "EUR"
    else:
        currency = ""
    match = re.search(r"([\d,]+(?:\.\d+)?)", value)
    if not match:
        return "", currency
    return match.group(1).replace(",", ""), currency
