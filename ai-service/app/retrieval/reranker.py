"""Reranker adapter. Tests use token overlap. Production can load a BGE cross-encoder."""

from __future__ import annotations

import logging
import os
import re
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)

_TOKEN = re.compile(r"[0-9A-Za-z]+")


class RerankerError(Exception):
    """The reranker could not score candidates."""


class Reranker(ABC):
    @abstractmethod
    def rerank(self, query: str, texts: list[str]) -> list[float]:
        raise NotImplementedError


class OverlapReranker(Reranker):
    """Deterministic stand-in. Higher overlap with the query scores higher."""

    def rerank(self, query: str, texts: list[str]) -> list[float]:
        query_tokens = set(_TOKEN.findall(query.lower()))
        scores: list[float] = []
        for text in texts:
            if not query_tokens:
                scores.append(0.0)
                continue
            tokens = _TOKEN.findall(text.lower())
            scores.append(sum(1 for token in tokens if token in query_tokens) / len(query_tokens))
        return scores


class BgeReranker(Reranker):
    def __init__(self, model_name: str) -> None:
        self._model_name = model_name
        self._model = None

    def rerank(self, query: str, texts: list[str]) -> list[float]:
        if not texts:
            return []
        try:
            model = self._load()
            raw = model.predict([(query, text) for text in texts])
            return [float(score) for score in raw]
        except Exception as exc:
            raise RerankerError("BGE reranker failed") from exc

    def _load(self):
        if self._model is None:
            from sentence_transformers import CrossEncoder

            logger.info("Loading reranker model %s", self._model_name)
            self._model = CrossEncoder(self._model_name)
        return self._model


_reranker: Reranker | None = None


def get_reranker() -> Reranker:
    global _reranker
    if _reranker is None:
        provider = os.getenv("RERANKER_PROVIDER", "overlap").strip().lower()
        if provider == "bge":
            model_name = os.getenv("RERANKER_MODEL_NAME", "BAAI/bge-reranker-v2-m3")
            _reranker = BgeReranker(model_name)
        else:
            _reranker = OverlapReranker()
    return _reranker


def set_reranker(reranker: Reranker | None) -> None:
    global _reranker
    _reranker = reranker
