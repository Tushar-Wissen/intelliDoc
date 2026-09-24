from __future__ import annotations

import hashlib
import re
import uuid
from dataclasses import dataclass, field, replace

from app.db.repository import (
    READY,
    ChunkRecord,
    ClassificationRecord,
    DocumentRecord,
    ExtractedFieldRecord,
    PageRecord,
    PipelineRepository,
    SectionRecord,
)
from app.pipeline.embedding_model import EMBEDDING_DIMENSION
from app.pipeline.indexing import (
    TRIGRAM_SIMILARITY_THRESHOLD,
    cosine_distance,
    keyword_rank,
    trigram_similarity,
)

_TOKEN = re.compile(r"[0-9A-Za-z]+")


@dataclass
class InMemoryJob:
    document_id: uuid.UUID
    stage: str = "PARSING"
    status: str = "PENDING"
    error_message: str | None = None


class InMemoryPipelineRepository(PipelineRepository):
    def __init__(self) -> None:
        self.documents: dict[uuid.UUID, DocumentRecord] = {}
        self.pages: dict[uuid.UUID, list[PageRecord]] = {}
        self.sections: dict[uuid.UUID, list[SectionRecord]] = {}
        self.chunks: dict[uuid.UUID, list[ChunkRecord]] = {}
        self.jobs: dict[uuid.UUID, InMemoryJob] = {}
        self.classification: dict[uuid.UUID, ClassificationRecord] = {}
        self.extracted_fields: dict[uuid.UUID, list[ExtractedFieldRecord]] = {}

    def add_document(self, document: DocumentRecord) -> DocumentRecord:
        self.documents[document.id] = document
        self.jobs[document.id] = InMemoryJob(document_id=document.id)
        return document

    def get_document(self, document_id: uuid.UUID) -> DocumentRecord | None:
        return self.documents.get(document_id)

    def set_processing_status(self, document_id: uuid.UUID, status: str) -> None:
        self.documents[document_id] = replace(
            self.documents[document_id],
            processing_status=status,
        )

    def mark_job_running(self, document_id: uuid.UUID) -> None:
        job = self.jobs.setdefault(document_id, InMemoryJob(document_id=document_id))
        job.status = "RUNNING"
        job.stage = "PARSING"
        job.error_message = None

    def mark_job_completed(self, document_id: uuid.UUID) -> None:
        job = self.jobs.setdefault(document_id, InMemoryJob(document_id=document_id))
        job.status = "COMPLETED"

    def mark_job_failed(self, document_id: uuid.UUID, error_message: str) -> None:
        job = self.jobs.setdefault(document_id, InMemoryJob(document_id=document_id))
        job.status = "FAILED"
        job.error_message = error_message

    def clear_parse_artifacts(self, document_id: uuid.UUID) -> None:
        self.pages[document_id] = []
        self.sections[document_id] = []
        self.chunks[document_id] = []

    def update_classification(
        self,
        document_id: uuid.UUID,
        *,
        document_type: str,
        classification_confidence: float,
        overview: str,
        summary: str,
    ) -> None:
        self.classification[document_id] = ClassificationRecord(
            document_type=document_type,
            classification_confidence=classification_confidence,
            overview=overview,
            summary=summary,
        )
        if document_id in self.documents:
            self.documents[document_id] = replace(
                self.documents[document_id],
                document_type=document_type,
            )

    def clear_extracted_fields(self, document_id: uuid.UUID) -> None:
        self.extracted_fields[document_id] = []

    def insert_extracted_fields(
        self,
        document_id: uuid.UUID,
        fields: list[ExtractedFieldRecord],
    ) -> None:
        self.extracted_fields.setdefault(document_id, []).extend(fields)

    def list_extracted_fields(self, document_id: uuid.UUID) -> list[ExtractedFieldRecord]:
        return list(self.extracted_fields.get(document_id, []))

    def update_embeddings(self, updates: list[tuple[uuid.UUID, list[float]]]) -> None:
        by_id = dict(updates)
        for chunks in self.chunks.values():
            for chunk in chunks:
                if chunk.id in by_id:
                    chunk.embedding = by_id[chunk.id]

    def vector_search(
        self,
        query_embedding: list[float],
        document_ids: list[uuid.UUID],
        k: int,
    ) -> list[ChunkRecord]:
        ranked: list[tuple[float, ChunkRecord]] = []
        allowed = set(document_ids)
        for document_id, chunks in self.chunks.items():
            if document_id not in allowed:
                continue
            for chunk in chunks:
                if chunk.embedding is None:
                    continue
                ranked.append((cosine_distance(query_embedding, chunk.embedding), chunk))
        ranked.sort(key=lambda item: (item[0], str(item[1].id)))
        return [chunk for _, chunk in ranked[:k]]

    def keyword_search(
        self,
        query_text: str,
        document_ids: list[uuid.UUID],
        k: int,
    ) -> list[ChunkRecord]:
        ranked: list[tuple[float, ChunkRecord]] = []
        allowed = set(document_ids)
        for document_id, chunks in self.chunks.items():
            if document_id not in allowed:
                continue
            for chunk in chunks:
                score = keyword_rank(chunk.chunk_text, query_text)
                if score is None:
                    continue
                ranked.append((score, chunk))
        ranked.sort(key=lambda item: (-item[0], str(item[1].id)))
        return [chunk for _, chunk in ranked[:k]]

    def trigram_search(
        self,
        query_text: str,
        document_ids: list[uuid.UUID],
        k: int,
    ) -> list[ChunkRecord]:
        ranked: list[tuple[float, ChunkRecord]] = []
        allowed = set(document_ids)
        for document_id, chunks in self.chunks.items():
            if document_id not in allowed:
                continue
            for chunk in chunks:
                score = trigram_similarity(chunk.chunk_text, query_text)
                if score <= TRIGRAM_SIMILARITY_THRESHOLD:
                    continue
                ranked.append((score, chunk))
        ranked.sort(key=lambda item: (-item[0], str(item[1].id)))
        return [chunk for _, chunk in ranked[:k]]

    def list_documents(self, document_ids: list[uuid.UUID]) -> list[DocumentRecord]:
        return [self.documents[document_id] for document_id in document_ids if document_id in self.documents]

    def section_headings(self, section_ids: list[uuid.UUID]) -> dict[uuid.UUID, str | None]:
        wanted = set(section_ids)
        headings: dict[uuid.UUID, str | None] = {}
        for sections in self.sections.values():
            for section in sections:
                if section.id in wanted:
                    headings[section.id] = section.heading
        return headings

    def scoped_vector_search(
        self,
        workspace_id: uuid.UUID,
        document_ids: list[uuid.UUID],
        query_embedding: list[float],
        k: int,
    ) -> list[ChunkRecord]:
        return self.vector_search(query_embedding, self._ready_ids(workspace_id, document_ids), k)

    def scoped_keyword_search(
        self,
        workspace_id: uuid.UUID,
        document_ids: list[uuid.UUID],
        query_text: str,
        k: int,
    ) -> list[ChunkRecord]:
        return self.keyword_search(query_text, self._ready_ids(workspace_id, document_ids), k)

    def scoped_trigram_search(
        self,
        workspace_id: uuid.UUID,
        document_ids: list[uuid.UUID],
        query_text: str,
        k: int,
    ) -> list[ChunkRecord]:
        return self.trigram_search(query_text, self._ready_ids(workspace_id, document_ids), k)

    def scoped_chunks_by_ids(
        self,
        workspace_id: uuid.UUID,
        document_ids: list[uuid.UUID],
        chunk_ids: list[uuid.UUID],
    ) -> list[ChunkRecord]:
        allowed_docs = set(self._ready_ids(workspace_id, document_ids))
        wanted = set(chunk_ids)
        found: list[ChunkRecord] = []
        for document_id, chunks in self.chunks.items():
            if document_id not in allowed_docs:
                continue
            for chunk in chunks:
                if chunk.id in wanted:
                    found.append(chunk)
        return found

    def _ready_ids(self, workspace_id: uuid.UUID, document_ids: list[uuid.UUID]) -> list[uuid.UUID]:
        wanted = set(document_ids)
        return [
            document_id
            for document_id, document in self.documents.items()
            if document_id in wanted
            and document.workspace_id == workspace_id
            and document.processing_status == READY
        ]

    def replace_pages(self, document_id: uuid.UUID, pages: list[PageRecord]) -> None:
        self.pages[document_id] = list(pages)

    def replace_sections(self, document_id: uuid.UUID, sections: list[SectionRecord]) -> None:
        self.sections[document_id] = list(sections)

    def replace_chunks(self, document_id: uuid.UUID, chunks: list[ChunkRecord]) -> None:
        self.chunks[document_id] = list(chunks)

    def list_pages(self, document_id: uuid.UUID) -> list[PageRecord]:
        return list(self.pages.get(document_id, []))

    def list_sections(self, document_id: uuid.UUID) -> list[SectionRecord]:
        return list(self.sections.get(document_id, []))

    def list_chunks(self, document_id: uuid.UUID) -> list[ChunkRecord]:
        return list(self.chunks.get(document_id, []))

    def update_page_ocr(
        self,
        page_id: uuid.UUID,
        raw_text: str,
        was_ocr: bool,
        ocr_confidence: float | None,
    ) -> None:
        for document_id, pages in self.pages.items():
            updated: list[PageRecord] = []
            for page in pages:
                if page.id == page_id:
                    updated.append(
                        PageRecord(
                            id=page.id,
                            document_id=page.document_id,
                            page_number=page.page_number,
                            raw_text=raw_text,
                            was_ocr=was_ocr,
                            ocr_confidence=ocr_confidence,
                        )
                    )
                else:
                    updated.append(page)
            self.pages[document_id] = updated


class OverlapEmbeddingModel:
    """Deterministic bag-of-words vectors so cosine rank follows token overlap.

    Tests use this instead of BGE-M3. Production loads BAAI/bge-m3.
    """

    def __init__(self, fail_times: int = 0) -> None:
        self.fail_times = fail_times
        self.calls = 0
        self.batches: list[list[str]] = []

    def encode(self, texts: list[str]) -> list[list[float]]:
        self.calls += 1
        self.batches.append(list(texts))
        if self.fail_times > 0:
            self.fail_times -= 1
            raise RuntimeError("embedding backend unavailable")
        return [_overlap_vector(text) for text in texts]


def _overlap_vector(text: str) -> list[float]:
    vector = [0.0] * EMBEDDING_DIMENSION
    tokens = _TOKEN.findall(text.lower())
    if not tokens:
        vector[0] = 1.0
        return vector
    for token in tokens:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % EMBEDDING_DIMENSION
        vector[index] += 1.0
    return vector


@dataclass
class FakeMinio:
    objects: dict[str, bytes] = field(default_factory=dict)

    def get_bytes(self, object_path: str) -> bytes:
        from app.storage.minio_client import MinioReadError

        if object_path not in self.objects:
            raise MinioReadError(f"Failed to read {object_path}")
        return self.objects[object_path]


class FakeParser:
    def __init__(self, parsed) -> None:
        self.parsed = parsed
        self.calls = 0

    def parse(self, file_bytes: bytes, file_type: str):
        self.calls += 1
        if isinstance(self.parsed, Exception):
            raise self.parsed
        return self.parsed


class InMemoryGraphStore:
    """MERGE semantics for Epic 5 tests. No live Neo4j required."""

    def __init__(self) -> None:
        self.nodes: dict[str, _GraphNode] = {}
        self.edges: set[tuple[str, str, str]] = set()

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
        if not workspace_id:
            raise RuntimeError("workspace_id is required")
        for node in self.nodes.values():
            if node.label == "Document" and node.properties.get("document_id") == document_id:
                if node.properties.get("workspace_id") != workspace_id:
                    raise RuntimeError("Refusing to attach a document node from another workspace")
                node.properties["group_id"] = group_id
                node.properties["title"] = title
                node.properties["document_type"] = document_type
                return node.node_id
        return self._add(
            "Document",
            {
                "document_id": document_id,
                "workspace_id": workspace_id,
                "group_id": group_id,
                "title": title,
                "document_type": document_type,
                "source_chunk_id": source_chunk_id,
                "source_page": source_page,
            },
        )

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
        from app.pipeline.kg_schema import normalize_entity_name

        normalized = normalize_entity_name(name)
        for node in self.nodes.values():
            if (
                node.label == entity_type
                and node.properties.get("workspace_id") == workspace_id
                and node.properties.get("normalized_name") == normalized
            ):
                return node.node_id, False
        node_id = self._add(
            entity_type,
            {
                "workspace_id": workspace_id,
                "normalized_name": normalized,
                "name": name.strip(),
                "document_id": document_id,
                "source_chunk_id": source_chunk_id,
                "source_page": source_page,
            },
        )
        return node_id, True

    def merge_date_fact(self, **params) -> str:
        return self._merge_fact("DateFact", params, ("workspace_id", "document_id", "label", "value"))

    def merge_amount(self, **params) -> str:
        return self._merge_fact(
            "Amount",
            params,
            ("workspace_id", "document_id", "label", "value", "currency"),
        )

    def merge_relationship(self, *, workspace_id: str, rel_type: str, start_id: str, end_id: str) -> None:
        start = self.nodes[start_id]
        end = self.nodes[end_id]
        if start.properties.get("workspace_id") != workspace_id or end.properties.get("workspace_id") != workspace_id:
            raise RuntimeError("Refusing a relationship across workspaces")
        self.edges.add((rel_type, start_id, end_id))

    def workspace_snapshot(self, workspace_id: str) -> dict:
        nodes = [
            {"node_id": node.node_id, "label": node.label, "properties": dict(node.properties)}
            for node in self.nodes.values()
            if node.properties.get("workspace_id") == workspace_id
        ]
        visible = {node["node_id"] for node in nodes}
        edges = [
            {
                "rel_type": rel_type,
                "start_id": start_id,
                "end_id": end_id,
                "document_id": None,
                "source_chunk_id": None,
                "source_page": None,
            }
            for rel_type, start_id, end_id in self.edges
            if start_id in visible and end_id in visible
        ]
        return {"nodes": nodes, "edges": edges}

    def find_document_node_ids_by_title(self, workspace_id: str, title_query: str) -> list[str]:
        from app.pipeline.kg_schema import normalize_entity_name

        needle = normalize_entity_name(title_query)
        matched: list[str] = []
        for node in self.nodes.values():
            if node.label != "Document" or node.properties.get("workspace_id") != workspace_id:
                continue
            title = normalize_entity_name(node.properties.get("title") or "")
            stem = title.rsplit(".", 1)[0]
            if needle and (needle == title or needle == stem or needle in stem or stem in needle):
                matched.append(node.node_id)
        return matched

    def related_document_ids(self, document_id: str, workspace_id: str) -> set[str]:
        by_node = {
            node.node_id: node
            for node in self.nodes.values()
            if node.label == "Document" and node.properties.get("workspace_id") == workspace_id
        }
        start = next(
            (
                node.node_id
                for node in by_node.values()
                if node.properties.get("document_id") == document_id
            ),
            None,
        )
        found = {document_id}
        if start is None:
            return found
        seen = {start}
        stack = [start]
        while stack:
            current = stack.pop()
            for rel_type, left, right in self.edges:
                if rel_type != "AMENDS":
                    continue
                other = right if left == current else left if right == current else None
                if other is None or other in seen or other not in by_node:
                    continue
                seen.add(other)
                stack.append(other)
                found.add(by_node[other].properties["document_id"])
        return found

    def facts_for_document(self, document_id: str, workspace_id: str) -> list[dict]:
        document = self._document(document_id, workspace_id)
        if document is None:
            return []
        facts: list[dict] = []
        for rel_type, start, end in self.edges:
            if start != document.node_id or rel_type not in {"EXPIRES_ON", "HAS_VALUE"}:
                continue
            fact = self.nodes[end]
            if fact.properties.get("workspace_id") != workspace_id:
                continue
            facts.append(
                {
                    "node_id": fact.node_id,
                    "fact_type": fact.label,
                    "label": fact.properties.get("label"),
                    "value": fact.properties.get("value"),
                    "document_id": fact.properties.get("document_id"),
                    "workspace_id": fact.properties.get("workspace_id"),
                    "source_page": fact.properties.get("source_page"),
                    "source_chunk_id": fact.properties.get("source_chunk_id"),
                }
            )
        return facts

    def merge_contradiction(self, workspace_id: str, left_node_id: str, right_node_id: str) -> None:
        left = self.nodes[left_node_id]
        right = self.nodes[right_node_id]
        if left.properties.get("workspace_id") != workspace_id or right.properties.get("workspace_id") != workspace_id:
            raise RuntimeError("Refusing a cross-workspace contradiction")
        self.edges.add(("CONTRADICTS", left_node_id, right_node_id))

    def contradictions_in_scope(self, workspace_id: str, document_ids: list[str]) -> list[dict]:
        allowed = set(document_ids)
        rows: list[dict] = []
        for rel_type, start, end in self.edges:
            if rel_type != "CONTRADICTS":
                continue
            left = self.nodes[start]
            right = self.nodes[end]
            if left.properties.get("workspace_id") != workspace_id:
                continue
            if right.properties.get("workspace_id") != workspace_id:
                continue
            left_doc = left.properties.get("document_id")
            right_doc = right.properties.get("document_id")
            if left_doc not in allowed or right_doc not in allowed:
                continue
            rows.append(
                {
                    "fact_type": left.label,
                    "label": left.properties.get("label"),
                    "left_value": left.properties.get("value"),
                    "right_value": right.properties.get("value"),
                    "left_document_id": left_doc,
                    "right_document_id": right_doc,
                    "left_source_page": left.properties.get("source_page"),
                    "right_source_page": right.properties.get("source_page"),
                    "left_source_chunk_id": left.properties.get("source_chunk_id"),
                    "right_source_chunk_id": right.properties.get("source_chunk_id"),
                    "workspace_id": workspace_id,
                }
            )
        return rows

    def cross_workspace_path_count(self) -> int:
        adjacency: dict[str, set[str]] = {}
        for _rel_type, start, end in self.edges:
            adjacency.setdefault(start, set()).add(end)
            adjacency.setdefault(end, set()).add(start)
        nodes = list(self.nodes.values())
        count = 0
        for index, origin in enumerate(nodes):
            seen: set[str] = set()
            stack = [origin.node_id]
            while stack:
                current = stack.pop()
                if current in seen:
                    continue
                seen.add(current)
                stack.extend(adjacency.get(current, ()))
            origin_workspace = origin.properties.get("workspace_id")
            for other in nodes[index + 1 :]:
                if other.node_id in seen and other.properties.get("workspace_id") != origin_workspace:
                    count += 1
        return count

    def counts_for_document(self, document_id: str, workspace_id: str) -> tuple[int, int]:
        document = self._document(document_id, workspace_id)
        if document is None:
            return (0, 0)
        node_ids = {document.node_id}
        edge_count = 0
        for _rel_type, start, end in self.edges:
            if start == document.node_id or end == document.node_id:
                edge_count += 1
                node_ids.add(start)
                node_ids.add(end)
        return (len(node_ids), edge_count)

    def named_entities(self, workspace_id: str, label: str, normalized_name: str | None = None) -> list[dict]:
        rows = []
        for node in self.nodes.values():
            if node.label != label or node.properties.get("workspace_id") != workspace_id:
                continue
            if normalized_name is not None and node.properties.get("normalized_name") != normalized_name:
                continue
            rows.append({"node_id": node.node_id, **node.properties})
        return rows

    def relationship_types_for_document(self, document_id: str, workspace_id: str) -> set[str]:
        document = self._document(document_id, workspace_id)
        if document is None:
            return set()
        return {
            rel_type
            for rel_type, start, end in self.edges
            if start == document.node_id or end == document.node_id
        }

    def _document(self, document_id: str, workspace_id: str) -> _GraphNode | None:
        for node in self.nodes.values():
            if (
                node.label == "Document"
                and node.properties.get("document_id") == document_id
                and node.properties.get("workspace_id") == workspace_id
            ):
                return node
        return None

    def _merge_fact(self, label: str, params: dict, keys: tuple[str, ...]) -> str:
        if not params.get("workspace_id"):
            raise RuntimeError("workspace_id is required")
        for node in self.nodes.values():
            if node.label != label:
                continue
            if all(node.properties.get(key) == params.get(key) for key in keys):
                return node.node_id
        stored = {key: params.get(key) for key in (*keys, "source_chunk_id", "source_page")}
        return self._add(label, stored)

    def _add(self, label: str, properties: dict) -> str:
        node_id = str(uuid.uuid4())
        self.nodes[node_id] = _GraphNode(node_id=node_id, label=label, properties=properties)
        return node_id


@dataclass
class _GraphNode:
    node_id: str
    label: str
    properties: dict


class FakeOcrEngine:
    def __init__(self, text: str = "ocr recovered text", confidence: float = 0.91) -> None:
        self.text = text
        self.confidence = confidence
        self.calls: list[bytes] = []

    def ocr_image(self, image_bytes: bytes) -> tuple[str, float]:
        self.calls.append(image_bytes)
        return self.text, self.confidence
