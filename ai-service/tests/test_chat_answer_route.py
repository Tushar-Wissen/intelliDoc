"""Integration test for internal endpoint POST /internal/ai/chat/answer (Epic 7)."""

import uuid
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.retrieval.schemas import (
    AnswerMode,
    EvidenceChunk,
    EvidencePackage,
    QuestionType,
    RetrievalDiagnostics,
)

client = TestClient(app)


def _sample_evidence_package(workspace_id: uuid.UUID, document_id: uuid.UUID) -> EvidencePackage:
    chunk_id = uuid.uuid4()
    return EvidencePackage(
        questionType=QuestionType.FACT,
        rewrittenQuery="What is this document about?",
        answerMode=AnswerMode.RETRIEVAL_PLUS_GRAPH,
        workspaceId=workspace_id,
        resolvedDocumentIds=[document_id],
        chunks=[
            EvidenceChunk(
                chunkId=chunk_id,
                documentId=document_id,
                documentName="sample.pdf",
                pageNumber=1,
                sectionHeading="Introduction",
                text="This is an example USENIX paper template in HTML and CSS form.",
                rerankScore=0.92,
                provenance=["vector"],
            )
        ],
        graphFacts=[],
        contradictions=[],
        perDocumentCounts={str(document_id): 1},
        diagnostics=RetrievalDiagnostics(
            graphStatus="OK",
            rerankSkipped=True,
            vectorCount=1,
            keywordCount=0,
            graphChunkCount=0,
            mergedCount=1,
            excludedDocumentIds=[],
            vectorLatencyMs=1,
            keywordLatencyMs=0,
            graphLatencyMs=0,
            totalLatencyMs=2,
        ),
    )


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


@patch("app.routers.chat_answer.RetrievalService")
def test_chat_answer_happy_path_with_mocked_retrieval(mock_retrieval_service):
    workspace_id = uuid.uuid4()
    document_id = uuid.uuid4()
    package = _sample_evidence_package(workspace_id, document_id)
    mock_retrieval_service.return_value.retrieve.return_value = package

    payload = {
        "sessionId": str(uuid.uuid4()),
        "workspaceId": str(workspace_id),
        "question": "What is this document about?",
        "resolvedDocumentIds": [str(document_id)],
        "scopeType": "documents",
        "mode": "retrieval_plus_graph",
    }

    response = client.post("/internal/ai/chat/answer", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["isNotFound"] is False
    assert data["answerText"]
    assert len(data["citations"]) >= 1
    assert "USENIX" in data["answerText"] or "template" in data["answerText"].lower()
