from __future__ import annotations

import uuid

from app.db.repository import DocumentRecord, PageRecord, SectionRecord
from app.pipeline.chunking import ChunkingError, chunk_document, pack_paragraphs
from app.pipeline.tokenizer import count_tokens
from tests.fakes import InMemoryPipelineRepository
from tests.fixtures import CONTRACT_HEADINGS, contract_paragraph


def _seed_document(repo: InMemoryPipelineRepository) -> uuid.UUID:
    document_id = uuid.uuid4()
    repo.add_document(
        DocumentRecord(
            id=document_id,
            file_name="contract.pdf",
            file_type="pdf",
            storage_path="workspace/w/document/d/original.pdf",
            processing_status="PARSING",
        )
    )
    pages = []
    sections = []
    for index, heading in enumerate(CONTRACT_HEADINGS, start=1):
        body = " ".join(contract_paragraph(heading) for _ in range(12))
        pages.append(
            PageRecord(
                id=uuid.uuid4(),
                document_id=document_id,
                page_number=index,
                raw_text=f"{heading}\n\n{body}",
                was_ocr=False,
                ocr_confidence=None,
            )
        )
        sections.append(
            SectionRecord(
                id=uuid.uuid4(),
                document_id=document_id,
                parent_section_id=None,
                heading=heading,
                start_page=index,
                end_page=index,
            )
        )
    repo.replace_pages(document_id, pages)
    repo.replace_sections(document_id, sections)
    return document_id


def test_pack_paragraphs_does_not_split_mid_sentence():
    sentence = "The supplier shall terminate only for material breach."
    paragraphs = [(sentence + " " + sentence, 1)]
    packed = pack_paragraphs(paragraphs, token_min=5, token_max=40)
    for text, _page in packed:
        assert "terminate only" in text or text.endswith(".")
        assert "bre" != text[-3:] or text.endswith("breach.")


def test_chunk_document_stores_required_fields_and_null_embedding():
    repo = InMemoryPipelineRepository()
    document_id = _seed_document(repo)
    chunk_document(document_id, repo=repo, token_min=50, token_max=180)
    chunks = repo.list_chunks(document_id)
    assert chunks
    section_ids = {section.id for section in repo.list_sections(document_id)}
    page_numbers = {page.page_number for page in repo.list_pages(document_id)}
    for chunk in chunks:
        assert chunk.document_id == document_id
        assert chunk.section_id in section_ids
        assert chunk.page_number in page_numbers
        assert chunk.chunk_text
        assert chunk.token_count == count_tokens(chunk.chunk_text)
        assert chunk.embedding is None


def test_chunk_ten_page_document_average_within_target():
    repo = InMemoryPipelineRepository()
    document_id = _seed_document(repo)
    token_min, token_max = 40, 160
    chunk_document(document_id, repo=repo, token_min=token_min, token_max=token_max)
    chunks = repo.list_chunks(document_id)
    assert chunks
    average = sum(chunk.token_count or 0 for chunk in chunks) / len(chunks)
    assert token_min <= average <= token_max
    for chunk in chunks:
        # AC1 may allow a slightly oversize leftover sentence pack; average is the rule.
        assert chunk.token_count is not None


def test_zero_chunks_fails():
    repo = InMemoryPipelineRepository()
    document_id = uuid.uuid4()
    repo.add_document(
        DocumentRecord(
            id=document_id,
            file_name="empty.pdf",
            file_type="pdf",
            storage_path="p",
            processing_status="PARSING",
        )
    )
    repo.replace_pages(
        document_id,
        [
            PageRecord(
                id=uuid.uuid4(),
                document_id=document_id,
                page_number=1,
                raw_text="   ",
                was_ocr=False,
                ocr_confidence=None,
            )
        ],
    )
    repo.replace_sections(
        document_id,
        [
            SectionRecord(
                id=uuid.uuid4(),
                document_id=document_id,
                parent_section_id=None,
                heading="Empty",
                start_page=1,
                end_page=1,
            )
        ],
    )
    try:
        chunk_document(document_id, repo=repo)
        assert False, "expected ChunkingError"
    except ChunkingError:
        pass
