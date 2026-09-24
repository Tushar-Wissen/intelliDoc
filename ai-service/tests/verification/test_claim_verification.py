"""Unit & integration tests for ClaimVerificationService (Story 7.2)."""

import uuid
from app.generation.answer_generation_service import DraftAnswer, DraftClaim
from app.verification.claim_verification_service import ClaimVerificationService
from app.verification.evidence_text_matcher import EvidenceTextMatcher
from app.verification.graph_contradiction_client import GraphCheckResult, GraphContradictionClient
from app.retrieval.schemas import (
    AnswerMode,
    ContradictionPair,
    ContradictionSide,
    EvidenceChunk,
    EvidencePackage,
    QuestionType,
    RetrievalDiagnostics,
)


def test_evidence_text_matcher_supports_matching_claim():
    passage = "The party shall provide thirty (30) days written notice prior to termination."
    claim = "The termination notice period is 30 days."

    assert EvidenceTextMatcher.supports(claim, passage) is True


def test_evidence_text_matcher_rejects_unsupported_claim():
    passage = "The party shall provide thirty (30) days written notice prior to termination."
    claim = "The company recorded EBITDA growth of 50 percent in Q4."

    assert EvidenceTextMatcher.supports(claim, passage) is False


def test_claim_verification_strips_unsupported_claims():
    chunk_id = uuid.uuid4()
    doc_id = uuid.uuid4()
    chunk = EvidenceChunk(
        chunkId=chunk_id,
        documentId=doc_id,
        documentName="contract.pdf",
        pageNumber=1,
        text="The termination notice period is 30 days.",
        rerankScore=0.9,
        provenance=["vector"],
    )

    package = EvidencePackage(
        questionType=QuestionType.FACT,
        rewrittenQuery="termination notice",
        answerMode=AnswerMode.RETRIEVAL_ONLY,
        workspaceId=uuid.uuid4(),
        resolvedDocumentIds=[doc_id],
        chunks=[chunk],
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
            vectorLatencyMs=5,
            keywordLatencyMs=0,
            graphLatencyMs=0,
            totalLatencyMs=5,
        ),
    )

    draft = DraftAnswer(
        text="The termination notice period is 30 days. Revenue grew by 50 percent.",
        claims=[
            DraftClaim(text="The termination notice period is 30 days.", cited_evidence_id=chunk_id),
            DraftClaim(text="Revenue grew by 50 percent.", cited_evidence_id=chunk_id),
        ],
    )

    verifier = ClaimVerificationService()
    verified = verifier.verify(
        draft_answer=draft,
        evidence_package=package,
        mode=AnswerMode.RETRIEVAL_ONLY,
        workspace_id=package.workspaceId,
        resolved_document_ids=[doc_id],
    )

    assert verified is not None
    assert verified.is_not_found is False
    assert len(verified.claims) == 2
    assert verified.claims[0].is_supported is True
    assert verified.claims[1].is_supported is False
    assert "Revenue grew by 50 percent" not in verified.answer_text
    assert "30 days" in verified.answer_text


def test_claim_verification_graph_contradiction_catches_conflict():
    chunk_id = uuid.uuid4()
    doc_id = uuid.uuid4()
    chunk = EvidenceChunk(
        chunkId=chunk_id,
        documentId=doc_id,
        documentName="contract.pdf",
        text="Effective date is 2025-01-01.",
        rerankScore=0.9,
        provenance=["vector"],
    )

    contradictions = [
        ContradictionPair(
            left=ContradictionSide(
                factType="DateFact",
                label="effective date",
                value="2025-01-01",
                documentId=doc_id,
                sourceChunkId=chunk_id,
            ),
            right=ContradictionSide(
                factType="DateFact",
                label="effective date",
                value="2025-06-01",
                documentId=uuid.uuid4(),
            ),
        )
    ]

    package = EvidencePackage(
        questionType=QuestionType.FACT,
        rewrittenQuery="effective date",
        answerMode=AnswerMode.RETRIEVAL_PLUS_GRAPH,
        workspaceId=uuid.uuid4(),
        resolvedDocumentIds=[doc_id],
        chunks=[chunk],
        graphFacts=[],
        contradictions=contradictions,
        perDocumentCounts={str(doc_id): 1},
        diagnostics=RetrievalDiagnostics(
            graphStatus="OK",
            rerankSkipped=False,
            vectorCount=1,
            keywordCount=0,
            graphChunkCount=0,
            mergedCount=1,
            excludedDocumentIds=[],
            vectorLatencyMs=5,
            keywordLatencyMs=0,
            graphLatencyMs=5,
            totalLatencyMs=10,
        ),
    )

    draft = DraftAnswer(
        text="Effective date is 2025-01-01 vs 2025-06-01.",
        claims=[
            DraftClaim(text="Effective date is 2025-01-01 vs 2025-06-01.", cited_evidence_id=chunk_id)
        ],
    )

    verifier = ClaimVerificationService()
    verified = verifier.verify(
        draft_answer=draft,
        evidence_package=package,
        mode=AnswerMode.RETRIEVAL_PLUS_GRAPH,
        workspace_id=package.workspaceId,
        resolved_document_ids=[doc_id],
    )

    # Claim is flagged unsupported by graph -> stripped -> 0 surviving claims -> returns None
    assert verified is None
