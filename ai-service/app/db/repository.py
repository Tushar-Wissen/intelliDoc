"""Pipeline persistence. Each stage commits independently (Epic 2 §15).

Prior parse artifacts for the same document are replaced before insert so a
Story 1.4 retry cannot duplicate page/section/chunk rows. This is application
cleanup, not an ERD change (open question §26, resolved for integration with
Epic 1 retry).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import bindparam, delete, select, text, update
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Session

from app.db.models import (
    Document,
    DocumentChunk,
    DocumentPage,
    DocumentSection,
    ExtractedField,
    ProcessingJob,
)
from app.db.session import get_session_factory

PARSING = "PARSING"
EXTRACTING = "EXTRACTING"
INDEXING = "INDEXING"
READY = "READY"
FAILED = "FAILED"
JOB_RUNNING = "RUNNING"
JOB_COMPLETED = "COMPLETED"
JOB_FAILED = "FAILED"


@dataclass
class DocumentRecord:
    id: uuid.UUID
    file_name: str
    file_type: str
    storage_path: str
    processing_status: str
    workspace_id: uuid.UUID | None = None
    group_id: uuid.UUID | None = None
    document_type: str | None = None


@dataclass
class PageRecord:
    id: uuid.UUID
    document_id: uuid.UUID
    page_number: int
    raw_text: str | None
    was_ocr: bool
    ocr_confidence: float | None


@dataclass
class SectionRecord:
    id: uuid.UUID
    document_id: uuid.UUID
    parent_section_id: uuid.UUID | None
    heading: str | None
    start_page: int | None
    end_page: int | None


@dataclass
class ChunkRecord:
    id: uuid.UUID
    document_id: uuid.UUID
    section_id: uuid.UUID | None
    page_number: int | None
    chunk_text: str
    token_count: int | None
    embedding: list[float] | None = None


@dataclass
class ClassificationRecord:
    document_type: str
    classification_confidence: float
    overview: str
    summary: str


@dataclass
class ExtractedFieldRecord:
    id: uuid.UUID
    document_id: uuid.UUID
    field_name: str
    field_category: str
    field_value: str
    confidence: float
    source_page: int
    source_chunk_id: uuid.UUID
    status: str


class PipelineRepository:
    def get_document(self, document_id: uuid.UUID) -> DocumentRecord | None:
        raise NotImplementedError

    def set_processing_status(self, document_id: uuid.UUID, status: str) -> None:
        raise NotImplementedError

    def mark_job_running(self, document_id: uuid.UUID) -> None:
        raise NotImplementedError

    def mark_job_completed(self, document_id: uuid.UUID) -> None:
        raise NotImplementedError

    def mark_job_failed(self, document_id: uuid.UUID, error_message: str) -> None:
        raise NotImplementedError

    def replace_pages(self, document_id: uuid.UUID, pages: list[PageRecord]) -> None:
        raise NotImplementedError

    def replace_sections(self, document_id: uuid.UUID, sections: list[SectionRecord]) -> None:
        raise NotImplementedError

    def replace_chunks(self, document_id: uuid.UUID, chunks: list[ChunkRecord]) -> None:
        raise NotImplementedError

    def list_pages(self, document_id: uuid.UUID) -> list[PageRecord]:
        raise NotImplementedError

    def list_sections(self, document_id: uuid.UUID) -> list[SectionRecord]:
        raise NotImplementedError

    def list_chunks(self, document_id: uuid.UUID) -> list[ChunkRecord]:
        raise NotImplementedError

    def list_extracted_fields(self, document_id: uuid.UUID) -> list[ExtractedFieldRecord]:
        raise NotImplementedError

    def update_page_ocr(
        self,
        page_id: uuid.UUID,
        raw_text: str,
        was_ocr: bool,
        ocr_confidence: float | None,
    ) -> None:
        raise NotImplementedError

    def clear_parse_artifacts(self, document_id: uuid.UUID) -> None:
        raise NotImplementedError

    def update_classification(
        self,
        document_id: uuid.UUID,
        *,
        document_type: str,
        classification_confidence: float,
        overview: str,
        summary: str,
    ) -> None:
        raise NotImplementedError

    def clear_extracted_fields(self, document_id: uuid.UUID) -> None:
        raise NotImplementedError

    def insert_extracted_fields(
        self,
        document_id: uuid.UUID,
        fields: list[ExtractedFieldRecord],
    ) -> None:
        raise NotImplementedError

    def update_embeddings(self, updates: list[tuple[uuid.UUID, list[float]]]) -> None:
        raise NotImplementedError

    def vector_search(
        self,
        query_embedding: list[float],
        document_ids: list[uuid.UUID],
        k: int,
    ) -> list[ChunkRecord]:
        raise NotImplementedError

    def keyword_search(
        self,
        query_text: str,
        document_ids: list[uuid.UUID],
        k: int,
    ) -> list[ChunkRecord]:
        raise NotImplementedError

    def trigram_search(
        self,
        query_text: str,
        document_ids: list[uuid.UUID],
        k: int,
    ) -> list[ChunkRecord]:
        raise NotImplementedError

    def list_documents(self, document_ids: list[uuid.UUID]) -> list[DocumentRecord]:
        raise NotImplementedError

    def section_headings(self, section_ids: list[uuid.UUID]) -> dict[uuid.UUID, str | None]:
        raise NotImplementedError

    def scoped_vector_search(
        self,
        workspace_id: uuid.UUID,
        document_ids: list[uuid.UUID],
        query_embedding: list[float],
        k: int,
    ) -> list[ChunkRecord]:
        """Cosine search joined to document for workspace and READY filters (Epic 6)."""
        raise NotImplementedError

    def scoped_keyword_search(
        self,
        workspace_id: uuid.UUID,
        document_ids: list[uuid.UUID],
        query_text: str,
        k: int,
    ) -> list[ChunkRecord]:
        raise NotImplementedError

    def scoped_trigram_search(
        self,
        workspace_id: uuid.UUID,
        document_ids: list[uuid.UUID],
        query_text: str,
        k: int,
    ) -> list[ChunkRecord]:
        raise NotImplementedError

    def scoped_chunks_by_ids(
        self,
        workspace_id: uuid.UUID,
        document_ids: list[uuid.UUID],
        chunk_ids: list[uuid.UUID],
    ) -> list[ChunkRecord]:
        raise NotImplementedError


class SqlAlchemyPipelineRepository(PipelineRepository):
    def _session(self) -> Session:
        return get_session_factory()()

    def get_document(self, document_id: uuid.UUID) -> DocumentRecord | None:
        with self._session() as session:
            row = session.get(Document, document_id)
            if row is None:
                return None
            return DocumentRecord(
                id=row.id,
                file_name=row.file_name,
                file_type=row.file_type,
                storage_path=row.storage_path,
                processing_status=row.processing_status,
                workspace_id=row.workspace_id,
                group_id=row.group_id,
                document_type=row.document_type,
            )

    def set_processing_status(self, document_id: uuid.UUID, status: str) -> None:
        with self._session() as session:
            session.execute(
                update(Document)
                .where(Document.id == document_id)
                .values(processing_status=status)
            )
            session.commit()

    def mark_job_running(self, document_id: uuid.UUID) -> None:
        with self._session() as session:
            job = self._latest_job(session, document_id)
            now = datetime.now(timezone.utc)
            if job is None:
                session.add(
                    ProcessingJob(
                        id=uuid.uuid4(),
                        document_id=document_id,
                        stage=PARSING,
                        status=JOB_RUNNING,
                        started_at=now,
                    )
                )
            else:
                job.status = JOB_RUNNING
                job.stage = PARSING
                job.started_at = now
                job.error_message = None
                job.completed_at = None
            session.commit()

    def mark_job_completed(self, document_id: uuid.UUID) -> None:
        with self._session() as session:
            job = self._latest_job(session, document_id)
            if job is not None:
                job.status = JOB_COMPLETED
                job.completed_at = datetime.now(timezone.utc)
            session.commit()

    def mark_job_failed(self, document_id: uuid.UUID, error_message: str) -> None:
        with self._session() as session:
            job = self._latest_job(session, document_id)
            now = datetime.now(timezone.utc)
            if job is None:
                session.add(
                    ProcessingJob(
                        id=uuid.uuid4(),
                        document_id=document_id,
                        stage=PARSING,
                        status=JOB_FAILED,
                        error_message=error_message,
                        started_at=now,
                        completed_at=now,
                    )
                )
            else:
                job.status = JOB_FAILED
                job.error_message = error_message
                job.completed_at = now
            session.commit()

    def clear_parse_artifacts(self, document_id: uuid.UUID) -> None:
        with self._session() as session:
            self._delete_artifacts(session, document_id)
            session.commit()

    def update_classification(
        self,
        document_id: uuid.UUID,
        *,
        document_type: str,
        classification_confidence: float,
        overview: str,
        summary: str,
    ) -> None:
        with self._session() as session:
            session.execute(
                update(Document)
                .where(Document.id == document_id)
                .values(
                    document_type=document_type,
                    classification_confidence=classification_confidence,
                    overview=overview,
                    summary=summary,
                )
            )
            session.commit()

    def clear_extracted_fields(self, document_id: uuid.UUID) -> None:
        with self._session() as session:
            session.execute(
                delete(ExtractedField).where(ExtractedField.document_id == document_id)
            )
            session.commit()

    def insert_extracted_fields(
        self,
        document_id: uuid.UUID,
        fields: list[ExtractedFieldRecord],
    ) -> None:
        if not fields:
            return
        with self._session() as session:
            now = datetime.now(timezone.utc)
            for field in fields:
                session.add(
                    ExtractedField(
                        id=field.id,
                        document_id=document_id,
                        field_name=field.field_name,
                        field_category=field.field_category,
                        field_value=field.field_value,
                        confidence=field.confidence,
                        source_page=field.source_page,
                        source_chunk_id=field.source_chunk_id,
                        status=field.status,
                        created_at=now,
                    )
                )
            session.commit()

    def replace_pages(self, document_id: uuid.UUID, pages: list[PageRecord]) -> None:
        with self._session() as session:
            session.execute(delete(DocumentPage).where(DocumentPage.document_id == document_id))
            for page in pages:
                session.add(
                    DocumentPage(
                        id=page.id,
                        document_id=document_id,
                        page_number=page.page_number,
                        raw_text=page.raw_text,
                        was_ocr=page.was_ocr,
                        ocr_confidence=page.ocr_confidence,
                    )
                )
            session.commit()

    def replace_sections(self, document_id: uuid.UUID, sections: list[SectionRecord]) -> None:
        with self._session() as session:
            session.execute(
                update(DocumentSection)
                .where(DocumentSection.document_id == document_id)
                .values(parent_section_id=None)
            )
            session.execute(
                delete(DocumentSection).where(DocumentSection.document_id == document_id)
            )
            for section in sections:
                session.add(
                    DocumentSection(
                        id=section.id,
                        document_id=document_id,
                        parent_section_id=section.parent_section_id,
                        heading=section.heading,
                        start_page=section.start_page,
                        end_page=section.end_page,
                    )
                )
            session.commit()

    def replace_chunks(self, document_id: uuid.UUID, chunks: list[ChunkRecord]) -> None:
        with self._session() as session:
            session.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document_id))
            for chunk in chunks:
                session.add(
                    DocumentChunk(
                        id=chunk.id,
                        document_id=document_id,
                        section_id=chunk.section_id,
                        page_number=chunk.page_number,
                        chunk_text=chunk.chunk_text,
                        token_count=chunk.token_count,
                    )
                )
            session.commit()

    def list_pages(self, document_id: uuid.UUID) -> list[PageRecord]:
        with self._session() as session:
            rows = session.scalars(
                select(DocumentPage)
                .where(DocumentPage.document_id == document_id)
                .order_by(DocumentPage.page_number)
            ).all()
            return [
                PageRecord(
                    id=row.id,
                    document_id=row.document_id,
                    page_number=row.page_number,
                    raw_text=row.raw_text,
                    was_ocr=row.was_ocr,
                    ocr_confidence=row.ocr_confidence,
                )
                for row in rows
            ]

    def list_sections(self, document_id: uuid.UUID) -> list[SectionRecord]:
        with self._session() as session:
            rows = session.scalars(
                select(DocumentSection).where(DocumentSection.document_id == document_id)
            ).all()
            return [
                SectionRecord(
                    id=row.id,
                    document_id=row.document_id,
                    parent_section_id=row.parent_section_id,
                    heading=row.heading,
                    start_page=row.start_page,
                    end_page=row.end_page,
                )
                for row in rows
            ]

    def list_chunks(self, document_id: uuid.UUID) -> list[ChunkRecord]:
        with self._session() as session:
            rows = session.execute(
                text(
                    """
                    SELECT id, document_id, section_id, page_number, chunk_text,
                           token_count, embedding::text AS embedding
                    FROM document_chunk
                    WHERE document_id = :document_id
                    """
                ),
                {"document_id": document_id},
            ).mappings().all()
            return [_chunk_from_mapping(row) for row in rows]

    def list_extracted_fields(self, document_id: uuid.UUID) -> list[ExtractedFieldRecord]:
        with self._session() as session:
            rows = session.scalars(
                select(ExtractedField).where(ExtractedField.document_id == document_id)
            ).all()
            records: list[ExtractedFieldRecord] = []
            for row in rows:
                if row.source_chunk_id is None or not (row.field_value or "").strip():
                    continue
                records.append(
                    ExtractedFieldRecord(
                        id=row.id,
                        document_id=row.document_id,
                        field_name=row.field_name,
                        field_category=row.field_category or "",
                        field_value=row.field_value or "",
                        confidence=row.confidence if row.confidence is not None else 0.0,
                        source_page=row.source_page or 1,
                        source_chunk_id=row.source_chunk_id,
                        status=row.status,
                    )
                )
            return records

    def update_embeddings(self, updates: list[tuple[uuid.UUID, list[float]]]) -> None:
        if not updates:
            return
        with self._session() as session:
            session.execute(
                text(
                    """
                    UPDATE document_chunk
                    SET embedding = CAST(:embedding AS vector)
                    WHERE id = :id
                    """
                ),
                [{"id": chunk_id, "embedding": _vector_literal(vector)} for chunk_id, vector in updates],
            )
            session.commit()

    def vector_search(
        self,
        query_embedding: list[float],
        document_ids: list[uuid.UUID],
        k: int,
    ) -> list[ChunkRecord]:
        if k <= 0 or not document_ids:
            return []
        statement = text(
            """
            SELECT id, document_id, section_id, page_number, chunk_text,
                   token_count, embedding::text AS embedding
            FROM document_chunk
            WHERE document_id = ANY(:document_ids)
              AND embedding IS NOT NULL
            ORDER BY embedding <=> CAST(:query_embedding AS vector)
            LIMIT :k
            """
        ).bindparams(bindparam("document_ids", type_=ARRAY(PG_UUID(as_uuid=True))))
        with self._session() as session:
            rows = session.execute(
                statement,
                {
                    "document_ids": document_ids,
                    "query_embedding": _vector_literal(query_embedding),
                    "k": k,
                },
            ).mappings().all()
            return [_chunk_from_mapping(row) for row in rows]

    def keyword_search(
        self,
        query_text: str,
        document_ids: list[uuid.UUID],
        k: int,
    ) -> list[ChunkRecord]:
        if k <= 0 or not document_ids or not query_text.strip():
            return []
        statement = text(
            """
            SELECT id, document_id, section_id, page_number, chunk_text,
                   token_count, embedding::text AS embedding
            FROM document_chunk
            WHERE document_id = ANY(:document_ids)
              AND to_tsvector('simple', chunk_text) @@ websearch_to_tsquery('simple', :query_text)
            ORDER BY ts_rank(
                to_tsvector('simple', chunk_text),
                websearch_to_tsquery('simple', :query_text)
            ) DESC
            LIMIT :k
            """
        ).bindparams(bindparam("document_ids", type_=ARRAY(PG_UUID(as_uuid=True))))
        with self._session() as session:
            rows = session.execute(
                statement,
                {
                    "document_ids": document_ids,
                    "query_text": query_text,
                    "k": k,
                },
            ).mappings().all()
            return [_chunk_from_mapping(row) for row in rows]

    def trigram_search(
        self,
        query_text: str,
        document_ids: list[uuid.UUID],
        k: int,
    ) -> list[ChunkRecord]:
        if k <= 0 or not document_ids or not query_text.strip():
            return []
        statement = text(
            """
            SELECT id, document_id, section_id, page_number, chunk_text,
                   token_count, embedding::text AS embedding
            FROM document_chunk
            WHERE document_id = ANY(:document_ids)
              AND chunk_text % :query_text
            ORDER BY similarity(chunk_text, :query_text) DESC
            LIMIT :k
            """
        ).bindparams(bindparam("document_ids", type_=ARRAY(PG_UUID(as_uuid=True))))
        with self._session() as session:
            rows = session.execute(
                statement,
                {
                    "document_ids": document_ids,
                    "query_text": query_text,
                    "k": k,
                },
            ).mappings().all()
            return [_chunk_from_mapping(row) for row in rows]

    def list_documents(self, document_ids: list[uuid.UUID]) -> list[DocumentRecord]:
        if not document_ids:
            return []
        with self._session() as session:
            rows = session.scalars(select(Document).where(Document.id.in_(document_ids))).all()
            return [
                DocumentRecord(
                    id=row.id,
                    file_name=row.file_name,
                    file_type=row.file_type,
                    storage_path=row.storage_path,
                    processing_status=row.processing_status,
                    workspace_id=row.workspace_id,
                    group_id=row.group_id,
                    document_type=row.document_type,
                )
                for row in rows
            ]

    def section_headings(self, section_ids: list[uuid.UUID]) -> dict[uuid.UUID, str | None]:
        if not section_ids:
            return {}
        statement = text(
            """
            SELECT id, heading
            FROM document_section
            WHERE id = ANY(:section_ids)
            """
        ).bindparams(bindparam("section_ids", type_=ARRAY(PG_UUID(as_uuid=True))))
        with self._session() as session:
            rows = session.execute(statement, {"section_ids": section_ids}).mappings().all()
            return {_as_uuid(row["id"]): row["heading"] for row in rows}

    def scoped_vector_search(
        self,
        workspace_id: uuid.UUID,
        document_ids: list[uuid.UUID],
        query_embedding: list[float],
        k: int,
    ) -> list[ChunkRecord]:
        if k <= 0 or not document_ids:
            return []
        statement = text(
            f"""
            SELECT c.id, c.document_id, c.section_id, c.page_number, c.chunk_text,
                   c.token_count, c.embedding::text AS embedding
            FROM document_chunk c
            JOIN document d ON d.id = c.document_id
            WHERE d.workspace_id = :workspace_id
              AND c.document_id = ANY(:document_ids)
              AND d.processing_status = '{READY}'
              AND c.embedding IS NOT NULL
            ORDER BY c.embedding <=> CAST(:query_embedding AS vector)
            LIMIT :k
            """
        ).bindparams(bindparam("document_ids", type_=ARRAY(PG_UUID(as_uuid=True))))
        with self._session() as session:
            rows = session.execute(
                statement,
                {
                    "workspace_id": workspace_id,
                    "document_ids": document_ids,
                    "query_embedding": _vector_literal(query_embedding),
                    "k": k,
                },
            ).mappings().all()
            return [_chunk_from_mapping(row) for row in rows]

    def scoped_keyword_search(
        self,
        workspace_id: uuid.UUID,
        document_ids: list[uuid.UUID],
        query_text: str,
        k: int,
    ) -> list[ChunkRecord]:
        if k <= 0 or not document_ids or not query_text.strip():
            return []
        statement = text(
            f"""
            SELECT c.id, c.document_id, c.section_id, c.page_number, c.chunk_text,
                   c.token_count, c.embedding::text AS embedding
            FROM document_chunk c
            JOIN document d ON d.id = c.document_id
            WHERE d.workspace_id = :workspace_id
              AND c.document_id = ANY(:document_ids)
              AND d.processing_status = '{READY}'
              AND to_tsvector('simple', c.chunk_text) @@ websearch_to_tsquery('simple', :query_text)
            ORDER BY ts_rank(
                to_tsvector('simple', c.chunk_text),
                websearch_to_tsquery('simple', :query_text)
            ) DESC
            LIMIT :k
            """
        ).bindparams(bindparam("document_ids", type_=ARRAY(PG_UUID(as_uuid=True))))
        with self._session() as session:
            rows = session.execute(
                statement,
                {
                    "workspace_id": workspace_id,
                    "document_ids": document_ids,
                    "query_text": query_text,
                    "k": k,
                },
            ).mappings().all()
            return [_chunk_from_mapping(row) for row in rows]

    def scoped_trigram_search(
        self,
        workspace_id: uuid.UUID,
        document_ids: list[uuid.UUID],
        query_text: str,
        k: int,
    ) -> list[ChunkRecord]:
        if k <= 0 or not document_ids or not query_text.strip():
            return []
        statement = text(
            f"""
            SELECT c.id, c.document_id, c.section_id, c.page_number, c.chunk_text,
                   c.token_count, c.embedding::text AS embedding
            FROM document_chunk c
            JOIN document d ON d.id = c.document_id
            WHERE d.workspace_id = :workspace_id
              AND c.document_id = ANY(:document_ids)
              AND d.processing_status = '{READY}'
              AND c.chunk_text % :query_text
            ORDER BY similarity(c.chunk_text, :query_text) DESC
            LIMIT :k
            """
        ).bindparams(bindparam("document_ids", type_=ARRAY(PG_UUID(as_uuid=True))))
        with self._session() as session:
            rows = session.execute(
                statement,
                {
                    "workspace_id": workspace_id,
                    "document_ids": document_ids,
                    "query_text": query_text,
                    "k": k,
                },
            ).mappings().all()
            return [_chunk_from_mapping(row) for row in rows]

    def scoped_chunks_by_ids(
        self,
        workspace_id: uuid.UUID,
        document_ids: list[uuid.UUID],
        chunk_ids: list[uuid.UUID],
    ) -> list[ChunkRecord]:
        if not document_ids or not chunk_ids:
            return []
        statement = text(
            f"""
            SELECT c.id, c.document_id, c.section_id, c.page_number, c.chunk_text,
                   c.token_count, c.embedding::text AS embedding
            FROM document_chunk c
            JOIN document d ON d.id = c.document_id
            WHERE d.workspace_id = :workspace_id
              AND c.document_id = ANY(:document_ids)
              AND d.processing_status = '{READY}'
              AND c.id = ANY(:chunk_ids)
            """
        ).bindparams(
            bindparam("document_ids", type_=ARRAY(PG_UUID(as_uuid=True))),
            bindparam("chunk_ids", type_=ARRAY(PG_UUID(as_uuid=True))),
        )
        with self._session() as session:
            rows = session.execute(
                statement,
                {
                    "workspace_id": workspace_id,
                    "document_ids": document_ids,
                    "chunk_ids": chunk_ids,
                },
            ).mappings().all()
            return [_chunk_from_mapping(row) for row in rows]

    def update_page_ocr(
        self,
        page_id: uuid.UUID,
        raw_text: str,
        was_ocr: bool,
        ocr_confidence: float | None,
    ) -> None:
        with self._session() as session:
            session.execute(
                update(DocumentPage)
                .where(DocumentPage.id == page_id)
                .values(
                    raw_text=raw_text,
                    was_ocr=was_ocr,
                    ocr_confidence=ocr_confidence,
                )
            )
            session.commit()

    @staticmethod
    def _latest_job(session: Session, document_id: uuid.UUID) -> ProcessingJob | None:
        return session.scalars(
            select(ProcessingJob)
            .where(ProcessingJob.document_id == document_id)
            .order_by(ProcessingJob.started_at.is_(None), ProcessingJob.started_at.desc())
        ).first()

    @staticmethod
    def _delete_artifacts(session: Session, document_id: uuid.UUID) -> None:
        session.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document_id))
        session.execute(
            update(DocumentSection)
            .where(DocumentSection.document_id == document_id)
            .values(parent_section_id=None)
        )
        session.execute(delete(DocumentSection).where(DocumentSection.document_id == document_id))
        session.execute(delete(DocumentPage).where(DocumentPage.document_id == document_id))


_default_repo: PipelineRepository | None = None


def get_repository() -> PipelineRepository:
    global _default_repo
    if _default_repo is None:
        _default_repo = SqlAlchemyPipelineRepository()
    return _default_repo


def set_repository(repo: PipelineRepository | None) -> None:
    global _default_repo
    _default_repo = repo


def _vector_literal(values: list[float]) -> str:
    return "[" + ",".join(format(value, ".8f") for value in values) + "]"


def _as_uuid(value: object) -> uuid.UUID:
    if isinstance(value, uuid.UUID):
        return value
    return uuid.UUID(str(value))


def _parse_vector(value: object) -> list[float] | None:
    if value is None:
        return None
    text_value = str(value).strip()
    if text_value == "" or text_value == "[]":
        return []
    inner = text_value[1:-1] if text_value.startswith("[") else text_value
    if not inner:
        return []
    return [float(part) for part in inner.split(",")]


def _chunk_from_mapping(row) -> ChunkRecord:
    section_id = row["section_id"]
    return ChunkRecord(
        id=_as_uuid(row["id"]),
        document_id=_as_uuid(row["document_id"]),
        section_id=_as_uuid(section_id) if section_id is not None else None,
        page_number=row["page_number"],
        chunk_text=row["chunk_text"],
        token_count=row["token_count"],
        embedding=_parse_vector(row["embedding"]),
    )
