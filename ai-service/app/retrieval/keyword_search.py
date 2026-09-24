"""Keyword channel. FTS uses Epic 4's simple configuration; identifiers use trigram search."""

from __future__ import annotations

import uuid

from app.db.repository import ChunkRecord, PipelineRepository
from app.pipeline.indexing import FTS_CONFIG, is_identifier_like
from app.retrieval.config import RetrievalConfig

assert FTS_CONFIG == "simple"


class KeywordSearcher:
    def __init__(self, repo: PipelineRepository, config: RetrievalConfig | None = None) -> None:
        self._repo = repo
        self._config = config or RetrievalConfig()

    def search(
        self,
        rewritten_query: str,
        verbatim_terms: list[str],
        workspace_id: uuid.UUID,
        document_ids: list[uuid.UUID],
    ) -> list[ChunkRecord]:
        if not document_ids:
            return []
        ranked: list[tuple[int, ChunkRecord]] = []
        if rewritten_query.strip():
            if _pure_identifier(rewritten_query):
                hits = self._repo.scoped_trigram_search(
                    workspace_id,
                    document_ids,
                    rewritten_query.strip(),
                    self._config.keyword_top_k,
                )
            else:
                hits = self._repo.scoped_keyword_search(
                    workspace_id,
                    document_ids,
                    rewritten_query,
                    self._config.keyword_top_k,
                )
            ranked.extend((index, chunk) for index, chunk in enumerate(hits))
        for term in verbatim_terms:
            cleaned = term.strip()
            if not cleaned:
                continue
            if _pure_identifier(cleaned):
                hits = self._repo.scoped_trigram_search(
                    workspace_id,
                    document_ids,
                    cleaned,
                    self._config.keyword_top_k,
                )
            else:
                hits = self._repo.scoped_keyword_search(
                    workspace_id,
                    document_ids,
                    f'"{cleaned}"',
                    self._config.keyword_top_k,
                )
            ranked.extend((index, chunk) for index, chunk in enumerate(hits))
        best: dict[uuid.UUID, tuple[int, ChunkRecord]] = {}
        for rank, chunk in ranked:
            current = best.get(chunk.id)
            if current is None or rank < current[0]:
                best[chunk.id] = (rank, chunk)
        ordered = sorted(best.values(), key=lambda item: (item[0], str(item[1].id)))
        return [chunk for _, chunk in ordered[: self._config.keyword_top_k]]


def _pure_identifier(text: str) -> bool:
    stripped = text.strip()
    return is_identifier_like(stripped) and not any(character.isspace() for character in stripped)
