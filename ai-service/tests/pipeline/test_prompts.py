from __future__ import annotations

import uuid

from app.pipeline.prompts import classification_prompt


def test_classification_prompt_requires_document_type_and_confidence():
    document_id = uuid.uuid4()
    prompt = classification_prompt(document_id, "Sample contract text")
    assert '"documentType"' in prompt
    assert '"confidence"' in prompt
    assert "contract, proposal, financial_report, policy, other" in prompt
    assert "Do not echo documentId" in prompt
    assert str(document_id) in prompt
