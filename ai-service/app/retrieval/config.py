"""Tunables from Epic 6 plan §21. Defaults are starting points for Epic 9."""

from __future__ import annotations

import os
from dataclasses import dataclass


def _int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return int(raw)


def _float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return float(raw)


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class RetrievalConfig:
    vector_top_k: int = 20
    keyword_top_k: int = 20
    graph_max_hops: int = 2
    graph_max_facts: int = 30
    merge_max_candidates: int = 40
    rrf_k: int = 60
    rerank_input_size: int = 30
    package_max_chunks: int = 8
    package_max_chunks_summary: int = 12
    package_max_tokens: int = 3000
    balance_max_share: float = 0.6
    balance_fanout_max_docs: int = 6
    classifier_context_turns: int = 3
    classifier_max_question_chars: int = 2000
    db_timeout_ms: int = 2000
    graph_timeout_ms: int = 2000
    llm_timeout_ms: int = 8000
    rerank_timeout_ms: int = 3000
    # F6 default: live chat degrades and flags. Set fail for evaluation runs.
    graph_failure: str = "degrade"
    graph_channel_enabled: bool = True
    reranker_provider: str = "overlap"
    reranker_model_name: str = "BAAI/bge-reranker-v2-m3"

    @classmethod
    def from_env(cls) -> RetrievalConfig:
        failure = os.getenv("RETRIEVAL_GRAPH_FAILURE", "degrade").strip().lower()
        if failure not in {"degrade", "fail"}:
            failure = "degrade"
        return cls(
            vector_top_k=_int("RETRIEVAL_VECTOR_TOP_K", 20),
            keyword_top_k=_int("RETRIEVAL_KEYWORD_TOP_K", 20),
            graph_max_hops=_int("RETRIEVAL_GRAPH_MAX_HOPS", 2),
            graph_max_facts=_int("RETRIEVAL_GRAPH_MAX_FACTS", 30),
            merge_max_candidates=_int("MERGE_MAX_CANDIDATES", 40),
            rrf_k=_int("MERGE_RRF_K", 60),
            rerank_input_size=_int("RERANK_INPUT_SIZE", 30),
            package_max_chunks=_int("PACKAGE_MAX_CHUNKS", 8),
            package_max_chunks_summary=_int("PACKAGE_MAX_CHUNKS_SUMMARY", 12),
            package_max_tokens=_int("PACKAGE_MAX_TOKENS", 3000),
            balance_max_share=_float("BALANCE_MAX_SHARE", 0.6),
            balance_fanout_max_docs=_int("BALANCE_FANOUT_MAX_DOCS", 6),
            classifier_context_turns=_int("CLASSIFIER_CONTEXT_TURNS", 3),
            classifier_max_question_chars=_int("CLASSIFIER_MAX_QUESTION_CHARS", 2000),
            db_timeout_ms=_int("RETRIEVAL_DB_TIMEOUT_MS", 2000),
            graph_timeout_ms=_int("RETRIEVAL_GRAPH_TIMEOUT_MS", 2000),
            llm_timeout_ms=_int("RETRIEVAL_LLM_TIMEOUT_MS", 8000),
            rerank_timeout_ms=_int("RETRIEVAL_RERANK_TIMEOUT_MS", 3000),
            graph_failure=failure,
            graph_channel_enabled=_bool("RETRIEVAL_GRAPH_ENABLED", True),
            reranker_provider=os.getenv("RERANKER_PROVIDER", "overlap").strip().lower(),
            reranker_model_name=os.getenv("RERANKER_MODEL_NAME", "BAAI/bge-reranker-v2-m3"),
        )
