"""Story 6.1 — T6.1-01 through T6.1-06."""

from __future__ import annotations

import logging

import pytest
from pydantic import ValidationError

from app.llm.client import CallableLlmClient, LlmError, RulesLlmClient
from app.retrieval.errors import RetrievalError
from app.retrieval.question_classifier import QuestionClassifier
from app.retrieval.schemas import ConversationTurn, QuestionRewriteSchema


def test_t6_1_01_comparison_sample():
    result = QuestionClassifier(RulesLlmClient()).classify_and_rewrite(
        "What's different between these two contracts?",
        scope_type="documents",
        document_count=2,
    )
    assert result.question_type == "comparison"
    assert result.rewritten_query == "termination clauses, obligations, key differences"


def test_t6_1_02_fact_summary_and_cross_document():
    classifier = QuestionClassifier(RulesLlmClient())
    fact = classifier.classify_and_rewrite(
        "What is the expiry date?",
        scope_type="documents",
        document_count=1,
    )
    summary = classifier.classify_and_rewrite(
        "Summarize the contract",
        scope_type="documents",
        document_count=1,
    )
    cross = classifier.classify_and_rewrite(
        "Which documents mention the same party across documents?",
        scope_type="workspace",
        document_count=4,
    )
    assert fact.question_type == "fact"
    assert summary.question_type == "summary"
    assert cross.question_type == "cross-document"


def test_t6_1_03_unknown_type_falls_back_to_fact():
    def broken(_prompt, schema):
        if schema is QuestionRewriteSchema:
            return {"type": "compare", "rewrittenQuery": "differences"}
        raise AssertionError(schema)

    result = QuestionClassifier(CallableLlmClient(broken)).classify_and_rewrite(
        "What's different between these two contracts?",
        scope_type="documents",
        document_count=2,
    )
    assert result.question_type == "fact"
    assert result.used_fallback is True
    assert result.rewritten_query == "What's different between these two contracts?"


def test_t6_1_04_conversational_question_is_rewritten():
    result = QuestionClassifier(RulesLlmClient()).classify_and_rewrite(
        "Can you please tell me what's different between these two contracts?",
        scope_type="documents",
        document_count=2,
    )
    assert result.question_type == "comparison"
    assert result.rewritten_query
    assert "can you" not in result.rewritten_query.lower()


def test_t6_1_05_identifier_is_preserved_verbatim():
    def drops_identifier(_prompt, _schema):
        return {"type": "fact", "rewrittenQuery": "expiry date of the agreement"}

    result = QuestionClassifier(CallableLlmClient(drops_identifier)).classify_and_rewrite(
        "What is the expiry date of SA-2026-014?",
        scope_type="documents",
        document_count=1,
    )
    assert "SA-2026-014" in result.rewritten_query


def test_t6_1_06_llm_timeout_falls_back(caplog):
    def timeout(_prompt, _schema):
        raise LlmError("timeout")

    with caplog.at_level(logging.WARNING):
        result = QuestionClassifier(CallableLlmClient(timeout)).classify_and_rewrite(
            "What is the expiry date?",
            scope_type="documents",
            document_count=1,
            request_id="req-timeout",
        )
    assert result.question_type == "fact"
    assert result.rewritten_query == "What is the expiry date?"
    assert result.used_fallback is True
    assert any(record.levelno == logging.WARNING for record in caplog.records)


def test_single_document_scope_downgrades_comparison():
    def comparison(_prompt, _schema):
        return {"type": "comparison", "rewrittenQuery": "key differences"}

    result = QuestionClassifier(CallableLlmClient(comparison)).classify_and_rewrite(
        "What's different between these two contracts?",
        scope_type="documents",
        document_count=1,
    )
    assert result.question_type == "fact"
    assert result.rewritten_query == "key differences"
    assert result.used_fallback is False


def test_follow_up_context_uses_only_the_last_configured_turns():
    seen = {}

    def capture(prompt, _schema):
        seen["prompt"] = prompt
        return {"type": "fact", "rewrittenQuery": "notice period"}

    history = [
        ConversationTurn(role="user", content=f"turn-{index}")
        for index in range(5)
    ]
    QuestionClassifier(CallableLlmClient(capture)).classify_and_rewrite(
        "What about the notice?",
        scope_type="documents",
        document_count=1,
        conversation_context=history,
    )
    prompt = seen["prompt"]
    assert "turn-4" in prompt
    assert "turn-2" in prompt
    assert "turn-0" not in prompt
    assert "turn-1" not in prompt


def test_empty_question_is_rejected():
    with pytest.raises(RetrievalError) as caught:
        QuestionClassifier(RulesLlmClient()).classify_and_rewrite(
            "   ",
            scope_type="documents",
            document_count=1,
        )
    assert caught.value.code == "INVALID_QUESTION"


def test_schema_rejects_unknown_question_type():
    with pytest.raises(ValidationError):
        QuestionRewriteSchema.model_validate({"type": "compare", "rewrittenQuery": "x"})
