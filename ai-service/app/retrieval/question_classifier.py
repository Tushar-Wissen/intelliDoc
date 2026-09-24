"""Story 6.1. One LLM call, schema-checked, with a fact-lookup fallback."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from pydantic import ValidationError

from app.llm.client import LlmError, StructuredLlmClient, get_llm_client
from app.retrieval.config import RetrievalConfig
from app.retrieval.errors import RetrievalError
from app.retrieval.identifier_extractor import extract_verbatim_terms
from app.retrieval.prompts import classification_prompt
from app.retrieval.schemas import ConversationTurn, QuestionRewriteSchema, QuestionType

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Classification:
    question_type: str
    rewritten_query: str
    used_fallback: bool
    verbatim_terms: list[str]


class QuestionClassifier:
    def __init__(self, llm: StructuredLlmClient | None = None, config: RetrievalConfig | None = None) -> None:
        self._llm = llm
        self._config = config or RetrievalConfig()

    def classify_and_rewrite(
        self,
        question: str,
        *,
        scope_type: str,
        document_count: int,
        conversation_context: list[ConversationTurn] | None = None,
        request_id: str = "",
    ) -> Classification:
        text = question.strip()
        if not text:
            raise RetrievalError("INVALID_QUESTION", "Question is empty")
        if len(text) > self._config.classifier_max_question_chars:
            raise RetrievalError("INVALID_QUESTION", "Question exceeds the configured length")
        terms = extract_verbatim_terms(text)
        history = _recent_turns(conversation_context or [], self._config.classifier_context_turns)
        prompt = classification_prompt(
            question=text,
            scope_type=scope_type,
            document_count=document_count,
            history=history,
        )
        try:
            parsed = self._client().complete_json(prompt, QuestionRewriteSchema, temperature=0)
        except (LlmError, ValidationError, TimeoutError) as exc:
            logger.warning(
                "Question classification fallback requestId=%s reason=%s",
                request_id,
                type(exc).__name__,
            )
            return Classification(
                question_type=QuestionType.FACT.value,
                rewritten_query=text,
                used_fallback=True,
                verbatim_terms=terms,
            )
        rewritten = _preserve_terms(parsed.rewrittenQuery, terms)
        question_type = parsed.type.value
        if document_count <= 1 and question_type == QuestionType.COMPARISON.value:
            question_type = QuestionType.FACT.value
        logger.debug(
            "Question classified requestId=%s type=%s rewrittenLength=%s",
            request_id,
            question_type,
            len(rewritten),
        )
        return Classification(
            question_type=question_type,
            rewritten_query=rewritten,
            used_fallback=False,
            verbatim_terms=terms,
        )

    def _client(self) -> StructuredLlmClient:
        return self._llm or get_llm_client()


def _recent_turns(turns: list[ConversationTurn], limit: int) -> list[tuple[str, str]]:
    if limit <= 0:
        return []
    selected = turns[-limit:]
    return [(turn.role, turn.content) for turn in selected]


def _preserve_terms(rewritten: str, terms: list[str]) -> str:
    missing = [term for term in terms if term not in rewritten]
    if not missing:
        return rewritten
    return f"{rewritten.rstrip()} {' '.join(missing)}".strip()
