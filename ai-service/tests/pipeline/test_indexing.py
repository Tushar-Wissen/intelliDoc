"""Epic 4 Stories 4.1 and 4.2. Traceability is in the test names."""

from __future__ import annotations

import uuid

import pytest

from app.db.repository import ChunkRecord
from app.pipeline.embedding_model import EMBEDDING_DIMENSION
from app.pipeline.indexing import (
    IndexingError,
    cosine_distance,
    generate_embeddings,
    is_identifier_like,
    keyword_search,
    route_text_search,
    trigram_search,
    trigram_similarity,
    vector_search,
)
from tests.fakes import InMemoryPipelineRepository, OverlapEmbeddingModel


def _chunk(document_id: uuid.UUID, text: str, page: int = 1) -> ChunkRecord:
    return ChunkRecord(
        id=uuid.uuid4(),
        document_id=document_id,
        section_id=None,
        page_number=page,
        chunk_text=text,
        token_count=len(text.split()),
        embedding=None,
    )


def _repo_with(*chunks: ChunkRecord) -> InMemoryPipelineRepository:
    repo = InMemoryPipelineRepository()
    by_document: dict[uuid.UUID, list[ChunkRecord]] = {}
    for chunk in chunks:
        by_document.setdefault(chunk.document_id, []).append(chunk)
    for document_id, document_chunks in by_document.items():
        repo.replace_chunks(document_id, document_chunks)
    return repo


def test_story_4_1_ac1_non_empty_chunks_are_embedded_and_blank_chunks_are_skipped():
    document_id = uuid.uuid4()
    useful = _chunk(document_id, "Either party may send a termination notice period of thirty days.")
    other = _chunk(document_id, "Fees are due within thirty days of invoice.")
    blank = _chunk(document_id, "   \n\t")
    repo = _repo_with(useful, other, blank)
    model = OverlapEmbeddingModel()

    stored = generate_embeddings(document_id, repo=repo, model=model)

    assert stored == 2
    assert model.calls == 1
    refreshed = {chunk.id: chunk for chunk in repo.list_chunks(document_id)}
    assert refreshed[useful.id].embedding is not None
    assert len(refreshed[useful.id].embedding) == EMBEDDING_DIMENSION
    assert refreshed[other.id].embedding is not None
    assert refreshed[blank.id].embedding is None


def test_story_4_1_ac2_vector_query_ranks_termination_clause_in_top_five():
    document_id = uuid.uuid4()
    termination = _chunk(
        document_id,
        "Either party may end the agreement by giving a termination notice period of thirty days.",
    )
    fees = _chunk(document_id, "Fees and payment terms require invoices within thirty days.")
    confidentiality = _chunk(document_id, "Confidentiality survives the agreement for two years.")
    liability = _chunk(document_id, "Liability is limited to the fees paid in the prior twelve months.")
    law = _chunk(document_id, "Governing law is the law of the state of Delaware.")
    signatures = _chunk(document_id, "Signatures of the authorized representatives conclude the agreement.")
    repo = _repo_with(termination, fees, confidentiality, liability, law, signatures)
    model = OverlapEmbeddingModel()
    generate_embeddings(document_id, repo=repo, model=model)

    query = model.encode(["termination notice period"])[0]
    results = vector_search(query, [document_id], k=5, repo=repo)

    assert termination.id in {chunk.id for chunk in results}
    assert results[0].id == termination.id
    distances = [cosine_distance(query, chunk.embedding or []) for chunk in results]
    assert distances == sorted(distances)


def test_story_4_1_vector_search_orders_by_cosine_distance_and_ignores_other_documents():
    document_id = uuid.uuid4()
    other_document = uuid.uuid4()
    close = _chunk(document_id, "termination notice period")
    far = _chunk(document_id, "unrelated signature block only")
    outsider = _chunk(other_document, "termination notice period")
    repo = _repo_with(close, far, outsider)
    model = OverlapEmbeddingModel()
    generate_embeddings(document_id, repo=repo, model=model)
    generate_embeddings(other_document, repo=repo, model=model)
    query = model.encode(["termination notice period"])[0]

    results = vector_search(query, [document_id], k=5, repo=repo)
    assert [chunk.id for chunk in results] == [close.id, far.id]
    distances = [cosine_distance(query, chunk.embedding or []) for chunk in results]
    assert distances == sorted(distances)
    assert outsider.id not in {chunk.id for chunk in results}


def test_vector_search_before_embeddings_returns_nothing():
    document_id = uuid.uuid4()
    chunk = _chunk(document_id, "termination notice period of thirty days")
    repo = _repo_with(chunk)
    query = OverlapEmbeddingModel().encode(["termination notice period"])[0]
    assert vector_search(query, [document_id], k=5, repo=repo) == []


def test_story_4_2_ac1_keyword_search_returns_phrase_chunks():
    document_id = uuid.uuid4()
    termination = _chunk(
        document_id,
        "The termination notice period is thirty days written notice.",
    )
    fees = _chunk(document_id, "Invoices are payable within thirty days.")
    repo = _repo_with(termination, fees)

    results = keyword_search("termination notice", [document_id], k=5, repo=repo)

    assert [chunk.id for chunk in results] == [termination.id]


def test_story_4_2_ac2_exact_identifier_ranks_above_non_matching_chunks():
    document_id = uuid.uuid4()
    exact = _chunk(document_id, "This agreement is identified as contract number SA-2026-014.")
    scattered = _chunk(
        document_id,
        "See SA in the 2026 archive under item 014 of the general index.",
    )
    semantic = _chunk(
        document_id,
        "The service agreement termination notice period resembles other contracts.",
    )
    repo = _repo_with(semantic, scattered, exact)

    results = keyword_search("SA-2026-014", [document_id], k=5, repo=repo)

    assert results
    assert results[0].id == exact.id
    assert semantic.id not in {chunk.id for chunk in results}
    assert [chunk.id for chunk in results].index(exact.id) < [chunk.id for chunk in results].index(scattered.id)


def test_keyword_search_tolerates_unbalanced_quotes_and_empty_scope():
    document_id = uuid.uuid4()
    chunk = _chunk(document_id, "Reference SA-2026-014 is binding.")
    repo = _repo_with(chunk)
    assert keyword_search('"SA-2026-014', [document_id], k=5, repo=repo)
    assert keyword_search("SA-2026-014", [], k=5, repo=repo) == []


def test_embedding_batch_retries_once_then_fails():
    document_id = uuid.uuid4()
    chunk = _chunk(document_id, "termination notice period")
    repo = _repo_with(chunk)

    recovered = OverlapEmbeddingModel(fail_times=1)
    assert generate_embeddings(document_id, repo=repo, model=recovered) == 1
    assert recovered.calls == 2
    assert repo.list_chunks(document_id)[0].embedding is not None

    failed_repo = _repo_with(_chunk(document_id, "termination notice period"))
    failing = OverlapEmbeddingModel(fail_times=2)
    with pytest.raises(IndexingError):
        generate_embeddings(document_id, repo=failed_repo, model=failing)
    assert failing.calls == 2
    assert failed_repo.list_chunks(document_id)[0].embedding is None


def test_story_4_2b_ac2_is_identifier_like_classifies_codes_and_prose():
    assert is_identifier_like("SA-2026-014")
    assert is_identifier_like("202614")
    assert not is_identifier_like("termination notice period")
    assert not is_identifier_like("A1")
    assert not is_identifier_like("invoice 30 days")
    assert not is_identifier_like("   ")


def test_story_4_2b_ac3_trigram_search_ranks_exact_identifier_by_similarity():
    document_id = uuid.uuid4()
    exact = _chunk(document_id, "SA-2026-014")
    nearby = _chunk(document_id, "Ref SA-2026-014")
    scattered = _chunk(
        document_id,
        "See SA in the 2026 archive under item 014 of the general index of miscellaneous records.",
    )
    semantic = _chunk(
        document_id,
        "The service agreement termination notice period resembles other contracts.",
    )
    repo = _repo_with(semantic, scattered, nearby, exact)

    results = trigram_search("SA-2026-014", [document_id], k=5, repo=repo)

    assert [chunk.id for chunk in results][:2] == [exact.id, nearby.id]
    assert scattered.id not in {chunk.id for chunk in results}
    assert semantic.id not in {chunk.id for chunk in results}
    assert trigram_similarity(exact.chunk_text, "SA-2026-014") > trigram_similarity(
        nearby.chunk_text, "SA-2026-014"
    )


def test_route_text_search_sends_identifiers_to_trigram_and_prose_to_keyword():
    document_id = uuid.uuid4()
    exact = _chunk(document_id, "SA-2026-014")
    prose = _chunk(document_id, "The termination notice period is thirty days written notice.")
    repo = _repo_with(exact, prose)

    identifier_hits = route_text_search("SA-2026-014", [document_id], k=5, repo=repo)
    prose_hits = route_text_search("termination notice", [document_id], k=5, repo=repo)

    assert [chunk.id for chunk in identifier_hits] == [exact.id]
    assert [chunk.id for chunk in prose_hits] == [prose.id]
    assert trigram_search("SA-2026-014", [], k=5, repo=repo) == []


def test_generate_embeddings_is_idempotent_for_chunks_already_embedded():
    document_id = uuid.uuid4()
    chunk = _chunk(document_id, "termination notice period")
    repo = _repo_with(chunk)
    model = OverlapEmbeddingModel()
    generate_embeddings(document_id, repo=repo, model=model)
    generate_embeddings(document_id, repo=repo, model=model)
    assert model.calls == 1
