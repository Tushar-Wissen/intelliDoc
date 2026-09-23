"""Story 2.2 — scanned-page detection and selective OCR (BR-201).

ASSUMPTION (§27): OCR failure on one page degrades that page
(was_ocr=true, ocr_confidence=0) and does not fail the document.
"""

from __future__ import annotations

import io
import logging
import uuid
from typing import Protocol

from app.config import settings
from app.db.repository import PageRecord, PipelineRepository, get_repository
from app.storage.minio_client import MinioStorage, get_minio

logger = logging.getLogger(__name__)


class OcrEngine(Protocol):
    def ocr_image(self, image_bytes: bytes) -> tuple[str, float]:
        ...


class OcrError(Exception):
    pass


def detect_scanned_pages(
    pages: list[PageRecord],
    threshold: int | None = None,
) -> list[int]:
    limit = settings.ocr_text_density_threshold if threshold is None else threshold
    flagged: list[int] = []
    for page in pages:
        density = len((page.raw_text or "").strip())
        if density < limit:
            flagged.append(page.page_number)
    return flagged


def detect_and_run(
    document_id: uuid.UUID,
    *,
    repo: PipelineRepository | None = None,
    minio: MinioStorage | None = None,
    engine: OcrEngine | None = None,
    renderer=None,
    threshold: int | None = None,
) -> None:
    repo = repo or get_repository()
    pages = repo.list_pages(document_id)
    scanned = detect_scanned_pages(pages, threshold=threshold)
    if not scanned:
        logger.info("OCR skipped documentId=%s scannedPages=0", document_id)
        return
    run_selective_ocr(
        document_id,
        scanned,
        repo=repo,
        minio=minio,
        engine=engine,
        renderer=renderer,
        pages=pages,
    )


def run_selective_ocr(
    document_id: uuid.UUID,
    scanned_page_numbers: list[int],
    *,
    repo: PipelineRepository | None = None,
    minio: MinioStorage | None = None,
    engine: OcrEngine | None = None,
    renderer=None,
    pages: list[PageRecord] | None = None,
) -> None:
    """OCR only flagged pages (BR-201). Untouched pages keep was_ocr=false."""
    repo = repo or get_repository()
    minio = minio or get_minio()
    engine = engine or PaddleOcrEngine()
    renderer = renderer or render_pdf_page
    pages = pages if pages is not None else repo.list_pages(document_id)
    document = repo.get_document(document_id)
    file_bytes = None
    if document is not None:
        try:
            file_bytes = minio.get_bytes(document.storage_path)
        except Exception as exc:
            logger.warning(
                "OCR could not load original file documentId=%s error=%s",
                document_id,
                exc,
            )

    scanned_set = set(scanned_page_numbers)
    ocr_count = 0
    for page in pages:
        if page.page_number not in scanned_set:
            continue
        original = page.raw_text or ""
        try:
            image_bytes = renderer(file_bytes, page.page_number) if file_bytes else None
            if not image_bytes:
                raise OcrError("No page image available")
            text, confidence = engine.ocr_image(image_bytes)
            updated_text = text.strip() or original
            repo.update_page_ocr(page.id, updated_text, True, float(confidence))
        except Exception as exc:
            logger.warning(
                "OCR failed for documentId=%s page=%s; degrading gracefully",
                document_id,
                page.page_number,
                exc_info=exc,
            )
            repo.update_page_ocr(page.id, original, True, 0.0)
        ocr_count += 1
    logger.info("OCR finished documentId=%s scannedPages=%s", document_id, ocr_count)


def render_pdf_page(file_bytes: bytes | None, page_number: int) -> bytes | None:
    if not file_bytes:
        return None
    try:
        import fitz
    except Exception:
        return None
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception:
        return None
    try:
        if page_number < 1 or page_number > doc.page_count:
            return None
        page = doc.load_page(page_number - 1)
        pixmap = page.get_pixmap(dpi=150)
        return pixmap.tobytes("png")
    finally:
        doc.close()


class PaddleOcrEngine:
    def __init__(self) -> None:
        self._ocr = None

    def _client(self):
        if self._ocr is None:
            from paddleocr import PaddleOCR

            self._ocr = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
        return self._ocr

    def ocr_image(self, image_bytes: bytes) -> tuple[str, float]:
        try:
            import numpy as np
            from PIL import Image
        except Exception as exc:
            raise OcrError("OCR image libraries are not available") from exc

        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        array = np.array(image)
        try:
            result = self._client().ocr(array, cls=True)
        except Exception as exc:
            raise OcrError("PaddleOCR failed") from exc

        lines: list[str] = []
        confidences: list[float] = []
        pages = result or []
        for block in pages:
            if not block:
                continue
            for item in block:
                if not item or len(item) < 2:
                    continue
                text_part = item[1]
                if isinstance(text_part, (list, tuple)) and text_part:
                    lines.append(str(text_part[0]))
                    if len(text_part) > 1:
                        try:
                            confidences.append(float(text_part[1]))
                        except (TypeError, ValueError):
                            pass
        text = "\n".join(lines).strip()
        confidence = sum(confidences) / len(confidences) if confidences else 0.0
        return text, confidence
