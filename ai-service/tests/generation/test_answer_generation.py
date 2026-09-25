"""Unit & integration tests for AnswerGenerationService (Story 7.1)."""

import uuid
import pytest
from unittest.mock import MagicMock

from app.generation.answer_generation_service import AnswerGenerationService, DraftAnswer
from app.generation.model_provider.base import CompletionResponse, ProviderError
from app.retrieval.schemas import (
    AnswerMode,
    EvidenceChunk,
    EvidencePackage,
    QuestionType,
    RetrievalDiagnostics,
)


def make_package(chunks=None):
    doc_id = uuid.uuid4()
    return EvidencePackage(
        questionType=QuestionType.FACT,
        rewrittenQuery="termination notice",
        answerMode=AnswerMode.RETRIEVAL_ONLY,
        workspaceId=uuid.uuid4(),
        resolvedDocumentIds=[doc_id],
        chunks=chunks or [],
        graphFacts=[],
        contradictions=[],
        perDocumentCounts={str(doc_id): len(chunks or [])},
        diagnostics=RetrievalDiagnostics(
            graphStatus="SKIPPED",
            rerankSkipped=False,
            vectorCount=len(chunks or []),
            keywordCount=0,
            graphChunkCount=0,
            mergedCount=len(chunks or []),
            excludedDocumentIds=[],
            vectorLatencyMs=5,
            keywordLatencyMs=0,
            graphLatencyMs=0,
            totalLatencyMs=5,
        ),
    )


def test_answer_generation_empty_evidence_package_short_circuits():
    mock_provider = MagicMock()
    service = AnswerGenerationService(provider=mock_provider)
    package = make_package(chunks=[])

    result = service.generate_answer("What is notice?", package)

    assert result is None
    mock_provider.generate.assert_not_called()


def test_answer_generation_parses_claims_and_chunk_tags():
    chunk_id = uuid.uuid4()
    doc_id = uuid.uuid4()
    chunk = EvidenceChunk(
        chunkId=chunk_id,
        documentId=doc_id,
        documentName="contract.pdf",
        pageNumber=2,
        text="The termination notice period is 60 days.",
        rerankScore=0.95,
        provenance=["vector"],
    )
    package = make_package(chunks=[chunk])

    mock_provider = MagicMock()
    mock_provider.generate.return_value = CompletionResponse(
        text=f"The termination notice period is 60 days. [chunk:{chunk_id}]"
    )

    service = AnswerGenerationService(provider=mock_provider)
    result = service.generate_answer("What is the termination notice period?", package)

    assert result is not None
    assert isinstance(result, DraftAnswer)
    assert len(result.claims) == 1
    assert result.claims[0].cited_evidence_id == chunk_id
    assert "60 days" in result.claims[0].text


def test_answer_generation_propagates_provider_error():
    chunk_id = uuid.uuid4()
    chunk = EvidenceChunk(
        chunkId=chunk_id,
        documentId=uuid.uuid4(),
        documentName="doc.pdf",
        text="Some text",
        rerankScore=0.8,
        provenance=["vector"],
    )
    package = make_package(chunks=[chunk])

    mock_provider = MagicMock()
    mock_provider.generate.side_effect = ProviderError("Ollama is offline")

    service = AnswerGenerationService(provider=mock_provider)

    with pytest.raises(ProviderError):
        service.generate_answer("What is notice?", package)
