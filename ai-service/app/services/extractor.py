from typing import List

from app.schemas import (
    ExtractedPage,
    ExtractedChunk,
    ExtractedSection,
    ExtractionPageInput,
    ExtractionResponse,
)


class SelectiveExtractor:
    """Routes weak pages to OCR while preserving source order and provenance."""

    MIN_NATIVE_WORDS = 3
    MAX_CHUNK_WORDS = 400

    @classmethod
    def native_text_is_usable(cls, text: str | None) -> bool:
        if not text or not text.strip():
            return False

        normalized = " ".join(text.split())
        words = normalized.split(" ")
        printable_characters = sum(character.isprintable() for character in normalized)
        printable_ratio = printable_characters / len(normalized) if normalized else 0
        return len(words) >= cls.MIN_NATIVE_WORDS and printable_ratio >= 0.95

    @classmethod
    def extract_page(cls, page: ExtractionPageInput) -> ExtractedPage:
        if cls.native_text_is_usable(page.native_text):
            return ExtractedPage(
                page_number=page.page_number,
                method="native",
                text=cls._normalize_text(page.native_text),
            )

        if page.ocr_text and page.ocr_text.strip():
            return ExtractedPage(
                page_number=page.page_number,
                method="ocr",
                text=cls._normalize_text(page.ocr_text),
                confidence=page.ocr_confidence,
            )

        return ExtractedPage(
            page_number=page.page_number,
            method="unavailable",
            text="",
            confidence=page.ocr_confidence,
        )

    @classmethod
    def extract(cls, document_id: str, pages: List[ExtractionPageInput]) -> ExtractionResponse:
        extracted_pages = [cls.extract_page(page) for page in sorted(pages, key=lambda item: item.page_number)]
        sections = cls._build_sections(extracted_pages)
        chunks = cls._build_chunks(extracted_pages, sections)
        combined_text = "\n\n".join(
            f"[Page {page.page_number}]\n{page.text}"
            for page in extracted_pages
            if page.text
        )
        return ExtractionResponse(
            document_id=document_id,
            pages=extracted_pages,
            combined_text=combined_text,
            ocr_pages=[page.page_number for page in extracted_pages if page.method == "ocr"],
            native_pages=[page.page_number for page in extracted_pages if page.method == "native"],
            sections=sections,
            chunks=chunks,
        )

    @classmethod
    def _build_sections(cls, pages: List[ExtractedPage]) -> List[ExtractedSection]:
        sections = []
        for page in pages:
            if not page.text:
                continue
            lines = [line.strip() for line in page.text.splitlines() if line.strip()]
            heading = next((line[:120] for line in lines if cls._looks_like_heading(line)), "Document content")
            section_id = f"section_{len(sections) + 1}"
            sections.append(ExtractedSection(section_id=section_id, heading=heading,
                                              start_page=page.page_number, end_page=page.page_number))
        return sections

    @staticmethod
    def _normalize_text(text: str) -> str:
        return "\n".join(" ".join(line.split()) for line in text.splitlines() if line.strip())

    @staticmethod
    def _looks_like_heading(line: str) -> bool:
        words = line.split()
        return 1 <= len(words) <= 12 and not line.endswith((".", ":", ";", ","))

    @classmethod
    def _build_chunks(cls, pages: List[ExtractedPage], sections: List[ExtractedSection]) -> List[ExtractedChunk]:
        chunks = []
        for page in pages:
            words = page.text.split()
            section_id = next((section.section_id for section in sections if section.start_page == page.page_number), None)
            for start in range(0, len(words), cls.MAX_CHUNK_WORDS):
                chunk_words = words[start:start + cls.MAX_CHUNK_WORDS]
                if not chunk_words:
                    continue
                chunks.append(ExtractedChunk(
                    chunk_id=f"chunk_{len(chunks) + 1}",
                    section_id=section_id,
                    page_number=page.page_number,
                    chunk_text=" ".join(chunk_words),
                    token_count=len(chunk_words),
                ))
        return chunks