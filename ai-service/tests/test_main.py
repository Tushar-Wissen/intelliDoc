from fastapi.testclient import TestClient
from app.main import app
from app.services.processor import DocumentProcessor
from app.services.llm_wrapper import OpenAIWrapper

client = TestClient(app)


class FakeOpenAIClient:
    class Chat:
        class Completions:
            @staticmethod
            def create(**kwargs):
                class Message:
                    content = '{"document_type":"bank_statement","confidence":0.88,"reason":"banking terms"}'

                class Choice:
                    message = Message()

                class Response:
                    choices = [Choice()]

                return Response()

        completions = Completions()

    chat = Chat()


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "UP"
    assert data["service"] == "intellidoc-ai-service"
    assert data["model_loaded"] is True


def test_openai_wrapper_returns_structured_classification():
    wrapper = OpenAIWrapper(client=FakeOpenAIClient())

    result = wrapper.classify_document("Account statement with closing balance", ["bank_statement", "other"])

    assert result == {
        "document_type": "bank_statement",
        "confidence": 0.88,
        "reason": "banking terms",
    }


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


def test_extract_contract_classifies_and_returns_provenance_fields():
    payload = {
        "document_id": "doc_contract_001",
        "title": "Signed Service Agreement",
        "content": (
            "This Service Agreement is entered between Acme Corp and Beta Ltd. "
            "Effective Date: 2026-01-01. The customer shall pay $45,000. "
            "Either party may terminate this agreement with 45 days notice."
        ),
        "chunks": [
            {
                "chunk_id": "chunk-contract-1",
                "page": 1,
                "text": "This Service Agreement is entered between Acme Corp and Beta Ltd. Effective Date: 2026-01-01.",
            },
            {
                "chunk_id": "chunk-contract-2",
                "page": 2,
                "text": "The customer shall pay $45,000. Either party may terminate this agreement with 45 days notice.",
            },
        ],
    }

    response = client.post("/api/v1/extract", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["document_type"] == "contract"
    assert data["classification_confidence"] == 0.93
    assert data["review_required"] is False
    fields = {field["field_name"]: field for field in data["fields"]}
    assert fields["Effective Date"]["field_value"] == "2026-01-01"
    assert fields["Effective Date"]["source_page"] == 1
    assert fields["Effective Date"]["source_chunk_id"] == "chunk-contract-1"
    assert fields["Termination Terms"]["source_page"] == 2
    assert fields["Parties"]["field_value"] == "Acme Corp, Beta Ltd"


def test_extract_financial_report_omits_contract_fields():
    response = client.post(
        "/api/v1/extract",
        json={
            "document_id": "doc_financial_001",
            "title": "FY2026 Financial Report",
            "content": "Revenue: $4.2 million. EBITDA: $800K. Forecast Period: FY2027.",
        },
    )

    assert response.status_code == 200
    data = response.json()
    field_names = {field["field_name"] for field in data["fields"]}
    assert data["document_type"] == "financial_report"
    assert {"Revenue", "EBITDA", "Forecast Period"}.issubset(field_names)
    assert "Termination Terms" not in field_names


def test_extract_unknown_document_requires_review():
    response = client.post(
        "/api/v1/extract",
        json={"document_id": "doc_other_001", "content": "A general internal note."},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["document_type"] == "other"
    assert data["classification_confidence"] < 0.5
    assert data["review_required"] is True


def test_extract_ai_classifies_unregistered_document_type(monkeypatch):
    class FakeClassifier:
        enabled = True

        @staticmethod
        def classify_document(content, document_types):
            return {
                "document_type": "invoice",
                "confidence": 0.92,
                "reason": "invoice number, total amount, and due date",
            }

    monkeypatch.setattr(DocumentProcessor, "LLM_CLASSIFIER", FakeClassifier())
    response = client.post(
        "/api/v1/extract",
        json={
            "document_id": "doc_invoice_002",
            "title": "Invoice",
            "content": "Invoice Number INV-2048. Bill To: Acme Ltd. Total Amount Due: $1,250.00. Due Date: 2026-10-05.",
            "chunks": [],
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["document_type"] == "invoice"
    assert data["classification_confidence"] >= 0.8
    assert data["review_required"] is False


def test_document_processor_registers_custom_type():
    original_rules = DocumentProcessor.CLASSIFICATION_RULES.copy()
    try:
        DocumentProcessor.register_document_type("invoice", ["invoice number", "total amount", "due date", "bill to"])
        document_type, confidence = DocumentProcessor.classify_document(
            "Invoice",
            "Invoice Number INV-2048. Total Amount Due is $1,250.00. Due date is 2026-10-05.",
        )
        assert document_type == "invoice"
        assert confidence >= 0.58
    finally:
        DocumentProcessor.CLASSIFICATION_RULES = original_rules


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
