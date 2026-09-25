from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "UP"
    assert data["service"] == "intellidoc-ai-service"
    assert data["model_loaded"] is True


def test_analyze_document_success():
    payload = {
        "document_id": "doc_test_100",
        "title": "Spring Boot and FastAPI Integration Guide.pdf",
        "content": "IntelliDoc demonstrates modern enterprise software architecture. The system achieved 99.9% uptime and recorded positive revenue growth of 25% across all regions.",
        "max_summary_length": 120
    }
    response = client.post("/api/v1/analyze", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["document_id"] == "doc_test_100"
    assert len(data["summary"]) > 0
    assert data["sentiment"] in ["POSITIVE", "NEUTRAL", "NEGATIVE"]
    assert isinstance(data["entities"], list)
    assert isinstance(data["key_topics"], list)
    assert data["confidence_score"] > 0


def test_analyze_document_empty_content():
    payload = {
        "document_id": "doc_test_101",
        "content": "   "
    }
    response = client.post("/api/v1/analyze", json=payload)
    assert response.status_code == 400


def test_qa_endpoint_success():
    payload = {
        "document_id": "doc_test_200",
        "context": "Spring Boot provides robust backend API services, while Python FastAPI handles AI model predictions and text analysis.",
        "question": "What handles AI model predictions?"
    }
    response = client.post("/api/v1/qa", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["document_id"] == "doc_test_200"
    assert "FastAPI" in data["answer"] or "Python" in data["answer"]
    assert data["confidence"] > 0.5
