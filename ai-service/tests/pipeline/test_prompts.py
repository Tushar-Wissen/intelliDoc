from __future__ import annotations

import uuid

from app.pipeline.prompts import rules_classification_prompt, summary_prompt


def test_rules_classification_prompt_includes_document_text():
    document_id = uuid.uuid4()
    prompt = rules_classification_prompt(document_id, "Sample contract text")
    assert "Classify the document" in prompt
    assert "Sample contract text" in prompt
    assert str(document_id) in prompt


def test_summary_prompt_requires_summary_key():
    document_id = uuid.uuid4()
    prompt = summary_prompt(document_id, "Sample contract text")
    assert '"summary"' in prompt
    assert "Do not echo documentId" in prompt
    assert str(document_id) in prompt
