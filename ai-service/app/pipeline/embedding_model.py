"""BGE-M3 embedding wrapper. The model is loaded once and reused (Story 4.1)."""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod

from app.config import settings

logger = logging.getLogger(__name__)

# BGE-M3 dense output size. Matches document_chunk.embedding vector(1024).
EMBEDDING_DIMENSION = 1024


class EmbeddingError(Exception):
    """The embedding model could not produce vectors."""


class EmbeddingModel(ABC):
    @abstractmethod
    def encode(self, texts: list[str]) -> list[list[float]]:
        raise NotImplementedError


class BgeM3EmbeddingModel(EmbeddingModel):
    """Lazy loader around sentence-transformers' BAAI/bge-m3 (or configured name)."""

    def __init__(self, model_name: str | None = None) -> None:
        self._model_name = model_name or settings.embedding_model_name
        self._model = None

    def encode(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        model = self._load()
        try:
            matrix = model.encode(
                texts,
                batch_size=settings.embedding_batch_size,
                normalize_embeddings=True,
                show_progress_bar=False,
            )
        except Exception as exc:
            raise EmbeddingError(f"Embedding model failed: {exc}") from exc
        vectors = [[float(value) for value in row] for row in matrix]
        for vector in vectors:
            if len(vector) != EMBEDDING_DIMENSION:
                raise EmbeddingError(
                    f"Expected {EMBEDDING_DIMENSION}-dimensional embeddings, got {len(vector)}"
                )
        return vectors

    def _load(self):
        if self._model is None:
            try:
                from sentence_transformers import SentenceTransformer
            except ImportError as exc:
                raise EmbeddingError(
                    "sentence-transformers is not installed; it is listed in requirements-pipeline.txt"
                ) from exc
            logger.info("Loading embedding model %s", self._model_name)
            try:
                self._model = SentenceTransformer(self._model_name)
            except Exception as exc:
                raise EmbeddingError(f"Could not load embedding model: {exc}") from exc
        return self._model


_default_model: EmbeddingModel | None = None


def get_embedding_model() -> EmbeddingModel:
    global _default_model
    if _default_model is None:
        _default_model = BgeM3EmbeddingModel()
    return _default_model


def set_embedding_model(model: EmbeddingModel | None) -> None:
    global _default_model
    _default_model = model
