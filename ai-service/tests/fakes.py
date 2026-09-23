from __future__ import annotations

import hashlib
import re
import uuid
from dataclasses import dataclass, field

from app.db.repository import (
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
        document = self.documents[document_id]
        self.documents[document_id] = DocumentRecord(
            id=document.id,
            file_name=document.file_name,
            file_type=document.file_type,
            storage_path=document.storage_path,
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

    def clear_extracted_fields(self, document_id: uuid.UUID) -> None:
        self.extracted_fields[document_id] = []

    def insert_extracted_fields(
        self,
        document_id: uuid.UUID,
        fields: list[ExtractedFieldRecord],
    ) -> None:
        self.extracted_fields.setdefault(document_id, []).extend(fields)

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


class FakeOcrEngine:
    def __init__(self, text: str = "ocr recovered text", confidence: float = 0.91) -> None:
        self.text = text
        self.confidence = confidence
        self.calls: list[bytes] = []

    def ocr_image(self, image_bytes: bytes) -> tuple[str, float]:
        self.calls.append(image_bytes)
        return self.text, self.confidence
