"""Vector channel. Uses the Epic 4 embedding model and a workspace-scoped query."""

from __future__ import annotations

import logging
import uuid

from app.db.repository import ChunkRecord, PipelineRepository
from app.pipeline.embedding_model import EmbeddingModel, get_embedding_model
from app.retrieval.config import RetrievalConfig
from app.retrieval.errors import RetrievalError

logger = logging.getLogger(__name__)


class VectorSearcher:
    def __init__(
        self,
        repo: PipelineRepository,
        embedder: EmbeddingModel | None = None,
        config: RetrievalConfig | None = None,
    ) -> None:
        self._repo = repo
        self._embedder = embedder
        self._config = config or RetrievalConfig()

    def search(
        self,
        rewritten_query: str,
        workspace_id: uuid.UUID,
        document_ids: list[uuid.UUID],
    ) -> list[ChunkRecord]:
        if not document_ids or not rewritten_query.strip():
            return []
        embedder = self._embedder or get_embedding_model()
        last: Exception | None = None
        for attempt in range(2):
            try:
                vectors = embedder.encode([rewritten_query])
                if len(vectors) != 1:
                    raise RetrievalError("RETRIEVAL_UNAVAILABLE", "Embedding model returned no query vector")
                return self._repo.scoped_vector_search(
                    workspace_id,
                    document_ids,
                    vectors[0],
                    self._config.vector_top_k,
                )
            except RetrievalError:
                raise
            except Exception as exc:
                last = exc
                logger.warning("Vector search attempt %s failed: %s", attempt + 1, type(exc).__name__)
        raise RetrievalError("RETRIEVAL_UNAVAILABLE", "Vector search failed") from last
