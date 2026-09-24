"""Story 2.3 — structure-aware chunking (BR-202).

AC1 takes precedence over AC3: a chunk may sit slightly outside 200–500 tokens
to avoid a mid-sentence split. Average size still targets the configured range.
"""

from __future__ import annotations

import logging
import re
import uuid

from app.config import settings
from app.db.repository import (
    ChunkRecord,
    PageRecord,
    PipelineRepository,
    SectionRecord,
    get_repository,
)
from app.pipeline.tokenizer import count_tokens

logger = logging.getLogger(__name__)

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")
_PARAGRAPH_SPLIT = re.compile(r"\n\s*\n")


class ChunkingError(Exception):
    pass


def chunk_document(
    document_id: uuid.UUID,
    *,
    repo: PipelineRepository | None = None,
    token_min: int | None = None,
    token_max: int | None = None,
) -> None:
    repo = repo or get_repository()
    pages = repo.list_pages(document_id)
    sections = repo.list_sections(document_id)
    if not pages:
        raise ChunkingError("The document produced no searchable text chunks.")

    token_min = settings.chunk_token_target_min if token_min is None else token_min
    token_max = settings.chunk_token_target_max if token_max is None else token_max

    if not sections:
        sections = [
            SectionRecord(
                id=uuid.uuid4(),
                document_id=document_id,
                parent_section_id=None,
                heading="Document",
                start_page=pages[0].page_number,
                end_page=pages[-1].page_number,
            )
        ]
        repo.replace_sections(document_id, sections)

    chunks: list[ChunkRecord] = []
    for section in _ordered_sections(sections):
        paragraphs = _paragraphs_for_section(section, sections, pages)
        packed = pack_paragraphs(paragraphs, token_min=token_min, token_max=token_max)
        for text, page_number in packed:
            if not text.strip():
                continue
            if page_number is None or section.id is None:
                raise ChunkingError("Chunk is missing page/section traceability.")
            chunks.append(
                ChunkRecord(
                    id=uuid.uuid4(),
                    document_id=document_id,
                    section_id=section.id,
                    page_number=page_number,
                    chunk_text=text.strip(),
                    token_count=count_tokens(text),
                    embedding=None,
                )
            )

    if not chunks:
        raise ChunkingError("The document produced no searchable text chunks.")

    repo.replace_chunks(document_id, chunks)
    logger.info("Chunked documentId=%s chunks=%s", document_id, len(chunks))


def pack_paragraphs(
    paragraphs: list[tuple[str, int]],
    *,
    token_min: int,
    token_max: int,
) -> list[tuple[str, int]]:
    """Pack paragraph text into chunks. Never splits mid-sentence when avoidable."""
    chunks: list[tuple[str, int]] = []
    buffer: list[str] = []
    buffer_page: int | None = None
    buffer_tokens = 0

    def flush() -> None:
        nonlocal buffer, buffer_page, buffer_tokens
        if buffer:
            chunks.append((" ".join(buffer).strip(), buffer_page or 1))
            buffer = []
            buffer_page = None
            buffer_tokens = 0

    for paragraph, page_number in paragraphs:
        pieces = _split_oversize(paragraph, token_max)
        for piece in pieces:
            piece_tokens = count_tokens(piece)
            if buffer and buffer_tokens + piece_tokens > token_max:
                flush()
            if not buffer:
                buffer_page = page_number
            buffer.append(piece)
            buffer_tokens += piece_tokens
            if buffer_tokens >= token_min and buffer_tokens >= token_max * 0.8:
                # Hold until next paragraph would overflow, unless already at max.
                if buffer_tokens >= token_max:
                    flush()

    flush()
    return [(text, page) for text, page in chunks if text]


def _split_oversize(text: str, token_max: int) -> list[str]:
    if count_tokens(text) <= token_max:
        return [text.strip()] if text.strip() else []
    sentences = [part.strip() for part in _SENTENCE_SPLIT.split(text) if part.strip()]
    if not sentences:
        return [text.strip()]
    packed: list[str] = []
    current: list[str] = []
    current_tokens = 0
    for sentence in sentences:
        tokens = count_tokens(sentence)
        if current and current_tokens + tokens > token_max:
            packed.append(" ".join(current))
            current = [sentence]
            current_tokens = tokens
        else:
            current.append(sentence)
            current_tokens += tokens
    if current:
        packed.append(" ".join(current))
    return packed


def _ordered_sections(sections: list[SectionRecord]) -> list[SectionRecord]:
    return sorted(
        sections,
        key=lambda section: (section.start_page or 1, section.heading or ""),
    )


def _paragraphs_for_section(
    section: SectionRecord,
    all_sections: list[SectionRecord],
    pages: list[PageRecord],
) -> list[tuple[str, int]]:
    start = section.start_page or 1
    end = section.end_page or start
    sibling_starts = [
        other.start_page
        for other in all_sections
        if other.id != section.id
        and other.start_page is not None
        and other.start_page > start
        and other.start_page <= end
        and _is_same_or_higher(other, section, all_sections)
    ]
    effective_end = min([end] + sibling_starts) if sibling_starts else end

    paragraphs: list[tuple[str, int]] = []
    heading = (section.heading or "").strip()
    for page in pages:
        if page.page_number < start or page.page_number > effective_end:
            continue
        text = page.raw_text or ""
        if heading and heading in text:
            text = text.split(heading, 1)[-1]
        for next_heading in _later_headings_on_page(page, section, all_sections):
            if next_heading and next_heading in text:
                text = text.split(next_heading, 1)[0]
        for block in _PARAGRAPH_SPLIT.split(text):
            cleaned = " ".join(block.split())
            if cleaned:
                paragraphs.append((cleaned, page.page_number))
    return paragraphs


def _later_headings_on_page(
    page: PageRecord,
    section: SectionRecord,
    all_sections: list[SectionRecord],
) -> list[str]:
    headings: list[str] = []
    for other in all_sections:
        if other.id == section.id:
            continue
        if other.start_page == page.page_number and (other.heading or ""):
            headings.append(other.heading or "")
    return headings


def _is_same_or_higher(
    other: SectionRecord,
    section: SectionRecord,
    all_sections: list[SectionRecord],
) -> bool:
    if other.parent_section_id == section.parent_section_id:
        return True
    if other.parent_section_id is None:
        return True
    return False
