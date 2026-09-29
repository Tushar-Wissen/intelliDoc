from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_process_route_accepts_camel_case_document_id(monkeypatch):
    delayed = []

    class _Task:
        @staticmethod
        def delay(document_id: str):
            delayed.append(document_id)

    monkeypatch.setattr("app.routers.documents.process_document_task", _Task)
    document_id = str(uuid.uuid4())
    response = client.post(
        "/internal/ai/documents/process",
        json={"documentId": document_id},
    )
    assert response.status_code == 202
    assert delayed == [document_id]
    assert response.json()["documentId"] == document_id


def test_process_route_enqueue_failure_returns_500(monkeypatch):
    class _Task:
        @staticmethod
        def delay(document_id: str):
            raise RuntimeError("broker down")

    monkeypatch.setattr("app.routers.documents.process_document_task", _Task)
    response = client.post(
        "/internal/ai/documents/process",
        json={"documentId": str(uuid.uuid4())},
    )
    assert response.status_code == 500
