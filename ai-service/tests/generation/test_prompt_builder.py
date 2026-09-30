"""Unit tests for PromptBuilder (Story 7.1 AC1)."""

import uuid
from app.generation.prompt_builder import PromptBuilder, SYSTEM_PROMPT
from app.retrieval.schemas import (
    AnswerMode,
    EvidenceChunk,
    EvidencePackage,
    GraphFactModel,
    QuestionType,
    RetrievalDiagnostics,
)


def test_prompt_builder_evidence_only_instruction():
    chunk_id = uuid.uuid4()
    doc_id = uuid.uuid4()
    package = EvidencePackage(
        questionType=QuestionType.FACT,
        rewrittenQuery="termination notice period",
        answerMode=AnswerMode.RETRIEVAL_ONLY,
        workspaceId=uuid.uuid4(),
        resolvedDocumentIds=[doc_id],
        chunks=[
            EvidenceChunk(
                chunkId=chunk_id,
                documentId=doc_id,
                documentName="contract.pdf",
                pageNumber=1,
                text="The termination notice period is 30 days.",
                rerankScore=0.9,
                provenance=["vector"],
            )
        ],
        graphFacts=[],
        contradictions=[],
        perDocumentCounts={str(doc_id): 1},
        diagnostics=RetrievalDiagnostics(
            graphStatus="SKIPPED",
            rerankSkipped=False,
            vectorCount=1,
            keywordCount=0,
            graphChunkCount=0,
            mergedCount=1,
            excludedDocumentIds=[],
            vectorLatencyMs=10,
            keywordLatencyMs=0,
            graphLatencyMs=0,
            totalLatencyMs=10,
        ),
    )

    prompt = PromptBuilder.build_prompt("What is the termination notice period?", package)

    assert SYSTEM_PROMPT in prompt
    assert "ONLY source of information is the evidence package" in prompt
    assert "Do NOT dump, quote, or repeat large blocks of evidence text." in prompt
    assert str(chunk_id) in prompt
    assert "The termination notice period is 30 days." in prompt
    assert "What is the termination notice period?" in prompt
    assert "Provide a direct, concise grounded answer." in prompt
    # No graph facts section for retrieval_only
    assert "GRAPH FACTS & RELATIONSHIPS:" not in prompt


def test_prompt_builder_splits_system_and_user():
    chunk_id = uuid.uuid4()
    doc_id = uuid.uuid4()
    package = EvidencePackage(
        questionType=QuestionType.FACT,
        rewrittenQuery="termination notice period",
        answerMode=AnswerMode.RETRIEVAL_ONLY,
        workspaceId=uuid.uuid4(),
        resolvedDocumentIds=[doc_id],
        chunks=[
            EvidenceChunk(
                chunkId=chunk_id,
                documentId=doc_id,
                documentName="contract.pdf",
                pageNumber=1,
                text="The termination notice period is 30 days.",
                rerankScore=0.9,
                provenance=["vector"],
            )
        ],
        graphFacts=[],
        contradictions=[],
        perDocumentCounts={str(doc_id): 1},
        diagnostics=RetrievalDiagnostics(
            graphStatus="SKIPPED",
            rerankSkipped=False,
            vectorCount=1,
            keywordCount=0,
            graphChunkCount=0,
            mergedCount=1,
            excludedDocumentIds=[],
            vectorLatencyMs=10,
            keywordLatencyMs=0,
            graphLatencyMs=0,
            totalLatencyMs=10,
        ),
    )

    system, user = PromptBuilder.build_prompt_parts("What is the notice period?", package)
    assert system == SYSTEM_PROMPT
    assert "=== EVIDENCE PACKAGE ===" in user
    assert "=== USER QUESTION ===" in user
    assert str(chunk_id) in user


def test_prompt_builder_includes_graph_facts_when_retrieval_plus_graph():
    chunk_id = uuid.uuid4()
    doc_id = uuid.uuid4()
    package = EvidencePackage(
        questionType=QuestionType.FACT,
        rewrittenQuery="termination notice period",
        answerMode=AnswerMode.RETRIEVAL_PLUS_GRAPH,
        workspaceId=uuid.uuid4(),
        resolvedDocumentIds=[doc_id],
        chunks=[
            EvidenceChunk(
                chunkId=chunk_id,
                documentId=doc_id,
                documentName="contract.pdf",
                pageNumber=1,
                text="The termination notice period is 30 days.",
                rerankScore=0.9,
                provenance=["vector"],
            )
        ],
        graphFacts=[
            GraphFactModel(
                factType="Contract",
                subject="Acme Corp",
                relationship="SIGNED",
                object="contract.pdf",
                documentId=doc_id,
                sourceChunkId=chunk_id,
            )
        ],
        contradictions=[],
        perDocumentCounts={str(doc_id): 1},
        diagnostics=RetrievalDiagnostics(
            graphStatus="OK",
            rerankSkipped=False,
            vectorCount=1,
            keywordCount=0,
            graphChunkCount=1,
            mergedCount=1,
            excludedDocumentIds=[],
            vectorLatencyMs=10,
            keywordLatencyMs=0,
            graphLatencyMs=15,
            totalLatencyMs=25,
        ),
    )

    prompt = PromptBuilder.build_prompt("What is the termination notice period?", package)

    assert "GRAPH FACTS & RELATIONSHIPS:" in prompt
    assert "(Acme Corp) -[SIGNED]-> (contract.pdf)" in prompt
