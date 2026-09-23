from __future__ import annotations

import uuid

from app.db.repository import DocumentRecord, PageRecord
from app.pipeline.ocr import detect_and_run, detect_scanned_pages
from tests.fakes import FakeMinio, FakeOcrEngine, InMemoryPipelineRepository


def _pages(document_id: uuid.UUID) -> list[PageRecord]:
    pages = []
    for number in range(1, 11):
        if number in {4, 9}:
            text = str(number)
        else:
            text = (
                "This is a sufficiently long extractable paragraph for a normal PDF page. "
                * 3
            )
        pages.append(
            PageRecord(
                id=uuid.uuid4(),
                document_id=document_id,
                page_number=number,
                raw_text=text,
                was_ocr=False,
                ocr_confidence=None,
            )
        )
    return pages


def test_detect_scanned_pages_flags_low_text_only():
    document_id = uuid.uuid4()
    flagged = detect_scanned_pages(_pages(document_id), threshold=80)
    assert flagged == [4, 9]


def test_selective_ocr_updates_only_flagged_pages():
    repo = InMemoryPipelineRepository()
    document_id = uuid.uuid4()
    document = repo.add_document(
        DocumentRecord(
            id=document_id,
            file_name="mixed.pdf",
            file_type="pdf",
            storage_path="workspace/w/document/d/original.pdf",
            processing_status="PARSING",
        )
    )
    repo.replace_pages(document_id, _pages(document_id))
    originals = {page.page_number: page.raw_text for page in repo.list_pages(document_id)}
    engine = FakeOcrEngine(text="OCR TEXT FROM SCAN", confidence=0.87)
    minio = FakeMinio(objects={document.storage_path: b"%PDF-1.4 fake"})

    def renderer(_bytes, page_number: int) -> bytes:
        return f"image-{page_number}".encode()

    detect_and_run(
        document_id,
        repo=repo,
        minio=minio,
        engine=engine,
        renderer=renderer,
        threshold=80,
    )

    assert len(engine.calls) == 2
    updated = {page.page_number: page for page in repo.list_pages(document_id)}
    for number in (4, 9):
        assert updated[number].was_ocr is True
        assert updated[number].ocr_confidence == 0.87
        assert updated[number].raw_text == "OCR TEXT FROM SCAN"
    for number in (1, 2, 3, 5, 6, 7, 8, 10):
        assert updated[number].was_ocr is False
        assert updated[number].ocr_confidence is None
        assert updated[number].raw_text == originals[number]


def test_ocr_page_failure_degrades_without_failing_document():
    repo = InMemoryPipelineRepository()
    document_id = uuid.uuid4()
    repo.add_document(
        DocumentRecord(
            id=document_id,
            file_name="scan.pdf",
            file_type="pdf",
            storage_path="workspace/w/document/d/original.pdf",
            processing_status="PARSING",
        )
    )
    page = PageRecord(
        id=uuid.uuid4(),
        document_id=document_id,
        page_number=1,
        raw_text="x",
        was_ocr=False,
        ocr_confidence=None,
    )
    repo.replace_pages(document_id, [page])

    class BoomEngine:
        def ocr_image(self, image_bytes: bytes):
            raise RuntimeError("paddle down")

    detect_and_run(
        document_id,
        repo=repo,
        minio=FakeMinio(objects={"workspace/w/document/d/original.pdf": b"pdf"}),
        engine=BoomEngine(),
        renderer=lambda *_args, **_kwargs: b"img",
        threshold=80,
    )
    updated = repo.list_pages(document_id)[0]
    assert updated.was_ocr is True
    assert updated.ocr_confidence == 0.0
    assert updated.raw_text == "x"
