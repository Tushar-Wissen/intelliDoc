from __future__ import annotations

import uuid
from pathlib import Path

from app.db.repository import DocumentRecord, PageRecord
from app.pipeline.parsing import ParseError, PyMuPdfParser, DocxParser, parse_document
from app.pipeline.types import ParsedDocument, ParsedPage, ParsedSection
from tests.fakes import FakeMinio, FakeParser, InMemoryPipelineRepository
from tests.fixtures import CONTRACT_HEADINGS, write_contract_pdf, write_structured_docx


def _document(file_type: str = "pdf") -> DocumentRecord:
    document_id = uuid.uuid4()
    return DocumentRecord(
        id=document_id,
        file_name=f"contract.{file_type}",
        file_type=file_type,
        storage_path=f"workspace/{uuid.uuid4()}/document/{document_id}/original.{file_type}",
        processing_status="UPLOADED",
    )


def test_parse_text_pdf_preserves_pages_and_headings(tmp_path: Path):
    pdf_path = write_contract_pdf(tmp_path / "contract.pdf")
    parsed = PyMuPdfParser().parse(pdf_path.read_bytes(), "pdf")
    assert len(parsed.pages) == 10
    assert [page.page_number for page in parsed.pages] == list(range(1, 11))
    assert all(page.raw_text.strip() for page in parsed.pages)
    extracted_headings = [heading for page in parsed.pages for heading in page.headings]
    for heading in CONTRACT_HEADINGS:
        assert any(heading in item for item in extracted_headings + [page.raw_text for page in parsed.pages])
    texts = [page.raw_text for page in parsed.pages]
    assert texts[0].find("Master Services Agreement") < texts[0].find("good faith")


def test_parse_docx_preserves_headings_paragraphs_and_tables(tmp_path: Path):
    docx_path = write_structured_docx(tmp_path / "sow.docx")
    parsed = DocxParser().parse(docx_path.read_bytes(), "docx")
    combined = "\n".join(page.raw_text for page in parsed.pages)
    assert "Statement of Work" in combined
    assert "The supplier shall deliver parsing, OCR, and chunking." in combined
    assert "Deliverable | Due date" in combined or "Parsed corpus" in combined
    headings = [section.heading for section in parsed.sections]
    assert "Statement of Work" in headings
    assert "Scope" in headings


def test_parse_document_writes_page_and_section_rows():
    repo = InMemoryPipelineRepository()
    document = repo.add_document(_document())
    minio = FakeMinio(objects={document.storage_path: b"fixture"})
    parsed = ParsedDocument(
        pages=[
            ParsedPage(page_number=i, raw_text=f"{heading}\nBody {i}.", headings=[heading])
            for i, heading in enumerate(CONTRACT_HEADINGS, start=1)
        ],
        sections=[
            ParsedSection(heading=heading, start_page=i, end_page=i, level=1)
            for i, heading in enumerate(CONTRACT_HEADINGS, start=1)
        ],
        file_type="pdf",
    )
    parse_document(document.id, repo=repo, minio=minio, parser=FakeParser(parsed))
    pages = repo.list_pages(document.id)
    sections = repo.list_sections(document.id)
    assert len(pages) == 10
    assert [page.page_number for page in pages] == list(range(1, 11))
    assert all(page.raw_text for page in pages)
    assert {section.heading for section in sections} == set(CONTRACT_HEADINGS)


def test_parse_corrupt_file_raises():
    repo = InMemoryPipelineRepository()
    document = repo.add_document(_document())
    minio = FakeMinio(objects={document.storage_path: b"nope"})
    try:
        parse_document(
            document.id,
            repo=repo,
            minio=minio,
            parser=FakeParser(ParseError("corrupt")),
        )
        assert False, "expected ParseError"
    except ParseError:
        assert repo.list_pages(document.id) == []
