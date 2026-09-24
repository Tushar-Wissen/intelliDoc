"""Integration test for internal endpoint POST /internal/ai/chat/answer (Epic 7)."""

import uuid
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_chat_answer_endpoint_empty_scope_returns_not_found():
    workspace_id = str(uuid.uuid4())
    payload = {
        "sessionId": str(uuid.uuid4()),
        "workspaceId": workspace_id,
        "question": "What is the termination period?",
        "resolvedDocumentIds": [],
        "scopeType": "documents",
        "mode": "retrieval_only",
    }

    response = client.post("/internal/ai/chat/answer", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["isNotFound"] is True
    assert data["confidence"] is None
    assert data["reason"] == "No supporting evidence found in the selected documents."


def test_chat_answer_endpoint_validation_error_empty_question():
    workspace_id = str(uuid.uuid4())
    payload = {
        "workspaceId": workspace_id,
        "question": "",
        "resolvedDocumentIds": [str(uuid.uuid4())],
    }

    response = client.post("/internal/ai/chat/answer", json=payload)
    assert response.status_code == 422  # Pydantic validation error for min_length=1
