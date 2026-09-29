"""Story 4.1 embeddings and Story 4.2 keyword search.

vector_search and keyword_search trust the caller's document id list.
Workspace scope is resolved by Epic 6 before it calls these functions.
"""

from __future__ import annotations

import logging
import re
import time
import uuid
from collections import Counter

from app.config import settings
from app.db.repository import ChunkRecord, PipelineRepository, get_repository
from app.pipeline.embedding_model import EMBEDDING_DIMENSION, EmbeddingModel, get_embedding_model

logger = logging.getLogger(__name__)

FTS_CONFIG = "simple"
_TOKEN = re.compile(r"[0-9A-Za-z]+")
_WEBSEARCH_PIECE = re.compile(r'"[^"]+"|\S+')


class IndexingError(Exception):
    """Embedding generation failed or a non-empty chunk is still unembedded."""


def generate_embeddings(
    document_id: uuid.UUID,
    *,
    repo: PipelineRepository | None = None,
    model: EmbeddingModel | None = None,
) -> int:
    """Fill document_chunk.embedding for chunks that do not have one yet.

    Empty and whitespace-only chunks are skipped (Epic 4 plan §27). A failed
    batch is retried once, then raised so the orchestrator marks the document
    FAILED. Returns the number of chunks embedded in this call.
    """
    repo = repo or get_repository()
    model = model or get_embedding_model()
    started = time.perf_counter()
    pending = [chunk for chunk in repo.list_chunks(document_id) if _needs_embedding(chunk)]
    embedded = 0
    for batch in _batches(pending, settings.embedding_batch_size):
        vectors = _encode_with_retry(model, [chunk.chunk_text for chunk in batch])
        repo.update_embeddings([(chunk.id, vector) for chunk, vector in zip(batch, vectors)])
        embedded += len(batch)
    assert_embeddings_complete(document_id, repo=repo)
    duration_ms = int((time.perf_counter() - started) * 1000)
    logger.info(
        "Embeddings stored documentId=%s count=%s durationMs=%s",
        document_id,
        embedded,
        duration_ms,
    )
    return embedded


def assert_embeddings_complete(
    document_id: uuid.UUID,
    *,
    repo: PipelineRepository | None = None,
) -> None:
    """BR-401: every non-empty chunk has an embedding before indexing can finish."""
    repo = repo or get_repository()
    missing = [
        chunk.id
        for chunk in repo.list_chunks(document_id)
        if chunk.chunk_text.strip() and chunk.embedding is None
    ]
    if missing:
        raise IndexingError(
            f"Document {document_id} has {len(missing)} non-empty chunk(s) without an embedding"
        )


def vector_search(
    query_embedding: list[float],
    document_ids: list[uuid.UUID],
    k: int,
    *,
    repo: PipelineRepository | None = None,
) -> list[ChunkRecord]:
    """Cosine-distance search (pgvector <=>). Closest chunks first. Unembedded rows are omitted."""
    if k <= 0 or not document_ids:
        return []
    repo = repo or get_repository()
    return repo.vector_search(query_embedding, list(document_ids), k)


def keyword_search(
    query_text: str,
    document_ids: list[uuid.UUID],
    k: int,
    *,
    repo: PipelineRepository | None = None,
) -> list[ChunkRecord]:
    """simple-config full-text search. websearch_to_tsquery tolerates malformed input."""
    if k <= 0 or not document_ids or not query_text or not query_text.strip():
        return []
    repo = repo or get_repository()
    return repo.keyword_search(query_text, list(document_ids), k)


def cosine_distance(left: list[float], right: list[float]) -> float:
    """pgvector cosine distance: 1 - cosine similarity. Lower is closer."""
    if not left or len(left) != len(right):
        return 1.0
    dot = 0.0
    left_norm = 0.0
    right_norm = 0.0
    for a, b in zip(left, right):
        dot += a * b
        left_norm += a * a
        right_norm += b * b
    if left_norm == 0.0 or right_norm == 0.0:
        return 1.0
    similarity = dot / ((left_norm ** 0.5) * (right_norm ** 0.5))
    return 1.0 - similarity


def keyword_rank(chunk_text: str, query_text: str) -> float | None:
    """In-memory stand-in for to_tsvector('simple') @@ websearch_to_tsquery('simple').

    Production queries run in Postgres. This ranker is used by the in-memory
    repository so unit tests cover the same match and ordering rules: simple
    tokenization (no stemming), AND of terms, quoted phrases, and a higher
    score when the terms sit in a tighter window (ts_rank analogue).
    Returns None when the chunk does not match. Does not raise on bad quotes.
    """
    alternatives = _parse_websearch(query_text)
    if not alternatives:
        return None
    tokens = _simple_tokens(chunk_text)
    if not tokens:
        return None
    best: float | None = None
    for requirements in alternatives:
        score = _alternative_rank(tokens, requirements)
        if score is None:
            continue
        best = score if best is None else max(best, score)
    return best


def _needs_embedding(chunk: ChunkRecord) -> bool:
    return chunk.embedding is None and bool(chunk.chunk_text.strip())


def _batches(chunks: list[ChunkRecord], size: int) -> list[list[ChunkRecord]]:
    step = size if size > 0 else 32
    return [chunks[index : index + step] for index in range(0, len(chunks), step)]


def _encode_with_retry(model: EmbeddingModel, texts: list[str]) -> list[list[float]]:
    last: Exception | None = None
    for attempt in range(2):
        try:
            vectors = model.encode(texts)
            if len(vectors) != len(texts):
                raise IndexingError(
                    f"Embedding model returned {len(vectors)} vectors for {len(texts)} chunks"
                )
            for vector in vectors:
                if len(vector) != EMBEDDING_DIMENSION:
                    raise IndexingError(
                        f"Expected {EMBEDDING_DIMENSION}-dimensional embeddings, got {len(vector)}"
                    )
            return vectors
        except Exception as exc:
            last = exc
            logger.warning("Embedding batch attempt %s failed: %s", attempt + 1, exc)
    assert last is not None
    raise IndexingError("Embedding batch failed after one retry") from last


def _simple_tokens(text: str) -> list[str]:
    return _TOKEN.findall(text.lower())


def _parse_websearch(query: str) -> list[list[tuple[str, ...]]]:
    """OR-separated alternatives. Each alternative is a list of required phrases.

    A one-token phrase is a single lexeme. A quoted multi-token phrase must
    occur in order. An unbalanced quote is stripped rather than rejected.
    """
    if query.count('"') % 2 == 1:
        query = query.replace('"', " ")
    alternatives: list[list[tuple[str, ...]]] = [[]]
    for piece in _WEBSEARCH_PIECE.findall(query):
        if piece.upper() == "OR":
            alternatives.append([])
            continue
        if piece.startswith("-") and not piece.startswith('"'):
            continue
        quoted = piece.startswith('"') and piece.endswith('"')
        inner = piece[1:-1] if quoted else piece
        tokens = tuple(_simple_tokens(inner))
        if not tokens:
            continue
        if quoted and len(tokens) > 1:
            alternatives[-1].append(tokens)
        else:
            alternatives[-1].extend((token,) for token in tokens)
    return [alternative for alternative in alternatives if alternative]


def _alternative_rank(tokens: list[str], requirements: list[tuple[str, ...]]) -> float | None:
    flattened: list[str] = []
    for phrase in requirements:
        if len(phrase) > 1 and not _phrase_present(tokens, phrase):
            return None
        flattened.extend(phrase)
    window = _min_window(tokens, flattened)
    if window is None:
        return None
    return len(flattened) / window


def _phrase_present(tokens: list[str], phrase: tuple[str, ...]) -> bool:
    width = len(phrase)
    return any(tuple(tokens[index : index + width]) == phrase for index in range(len(tokens) - width + 1))


def _min_window(tokens: list[str], required: list[str]) -> int | None:
    needed = Counter(required)
    if not needed:
        return None
    have: Counter[str] = Counter()
    satisfied = 0
    left = 0
    best: int | None = None
    for right, token in enumerate(tokens):
        if token in needed:
            have[token] += 1
            if have[token] == needed[token]:
                satisfied += 1
        while satisfied == len(needed) and left <= right:
            width = right - left + 1
            best = width if best is None else min(best, width)
            left_token = tokens[left]
            if left_token in needed:
                if have[left_token] == needed[left_token]:
                    satisfied -= 1
                have[left_token] -= 1
            left += 1
    return best


# Story 4.2b. pg_trgm's default similarity_threshold. The % operator matches
# when similarity is strictly greater than this value.
TRIGRAM_SIMILARITY_THRESHOLD = 0.3

# Plan §14 leaves the exact identifier rule open and gives this shape:
# a digit, and either a hyphen or a single token, and short enough that a
# trigram scan stays precise. Only the minimum length is a named setting.
_IDENTIFIER_QUERY_MAX_LENGTH = 64
_WORD = re.compile(r"[0-9A-Za-z]+")


def is_identifier_like(query_text: str) -> bool:
    """True when a query looks like a code or reference number, not prose.

    Pure classifier. It does not run keyword_search or trigram_search.
    """
    text = query_text.strip()
    if len(text) < settings.identifier_query_min_length:
        return False
    if len(text) > _IDENTIFIER_QUERY_MAX_LENGTH:
        return False
    if not any(character.isdigit() for character in text):
        return False
    single_token = not any(character.isspace() for character in text)
    return ("-" in text) or single_token


def trigram_search(
    query_text: str,
    document_ids: list[uuid.UUID],
    k: int,
    *,
    repo: PipelineRepository | None = None,
) -> list[ChunkRecord]:
    """pg_trgm similarity search. Highest similarity first. Scoped to document_ids."""
    if k <= 0 or not document_ids or not query_text or not query_text.strip():
        return []
    repo = repo or get_repository()
    return repo.trigram_search(query_text, list(document_ids), k)


def route_text_search(
    query_text: str,
    document_ids: list[uuid.UUID],
    k: int,
    *,
    repo: PipelineRepository | None = None,
) -> list[ChunkRecord]:
    """Epic 6 entry point. Identifier-shaped queries use trigram_search; other text uses keyword_search."""
    if is_identifier_like(query_text):
        return trigram_search(query_text, document_ids, k, repo=repo)
    return keyword_search(query_text, document_ids, k, repo=repo)


def trigram_similarity(left: str, right: str) -> float:
    """In-memory stand-in for pg_trgm similarity(): |intersection| / |union| of word trigrams.

    Postgres is the production path. Non-alphanumeric characters are word
    boundaries, matching pg_trgm, so a hyphenated identifier and the same
    tokens scattered through a long passage do not receive the same score.
    """
    left_grams = _pg_trigrams(left)
    right_grams = _pg_trigrams(right)
    if not left_grams or not right_grams:
        return 0.0
    shared = len(left_grams & right_grams)
    return shared / len(left_grams | right_grams)


def _pg_trigrams(text: str) -> set[str]:
    grams: set[str] = set()
    for word in _WORD.findall(text.lower()):
        padded = f"  {word} "
        grams.update(padded[index : index + 3] for index in range(len(padded) - 2))
    return grams
