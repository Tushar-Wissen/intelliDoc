"""Claim verification service against evidence text and knowledge graph (Story 7.2)."""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field

from app.generation.answer_generation_service import DraftAnswer, DraftClaim
from app.verification.evidence_text_matcher import EvidenceTextMatcher
from app.verification.graph_contradiction_client import GraphContradictionClient
from app.retrieval.schemas import AnswerMode, EvidencePackage

logger = logging.getLogger(__name__)


@dataclass
class VerifiedClaim:
    text: str
    cited_evidence_id: uuid.UUID | None
    supported_by_text: bool
    supported_by_graph: bool
    is_supported: bool


@dataclass
class VerifiedCitation:
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    document_name: str
    page_number: int | None
    section_heading: str | None
    source_excerpt: str


@dataclass
class VerifiedAnswer:
    answer_text: str
    claims: list[VerifiedClaim] = field(default_factory=list)
    citations: list[VerifiedCitation] = field(default_factory=list)
    confidence: float = 0.0
    answer_mode: AnswerMode = AnswerMode.RETRIEVAL_ONLY
    is_not_found: bool = False
    reason: str | None = None


class ClaimVerificationService:
    def __init__(self, graph_client: GraphContradictionClient | None = None) -> None:
        self._graph_client = graph_client or GraphContradictionClient()

    def verify(
        self,
        draft_answer: DraftAnswer,
        evidence_package: EvidencePackage,
        mode: AnswerMode,
        workspace_id: uuid.UUID,
        resolved_document_ids: list[uuid.UUID],
    ) -> VerifiedAnswer | None:
        """Verify each claim in draft answer against evidence text and knowledge graph.

        Strips unsupported claims. If surviving claims do not substantively answer, returns None.
        """
        if not draft_answer or not draft_answer.claims:
            logger.info("Empty draft answer or no claims to verify")
            return None

        # Build lookup for evidence chunks by chunk ID
        chunk_map = {chunk.chunkId: chunk for chunk in evidence_package.chunks}

        # Check graph contradictions if mode == retrieval_plus_graph
        graph_contradictions = []
        if mode == AnswerMode.RETRIEVAL_PLUS_GRAPH:
            check_result = self._graph_client.check_scope_contradictions(
                workspace_id=workspace_id,
                resolved_document_ids=resolved_document_ids,
            )
            if check_result.query_failed:
                logger.warning("Graph verification query failed; failing closed for graph checks")
            graph_contradictions = check_result.contradictions
            # Also include contradictions reported directly in evidence_package
            if evidence_package.contradictions:
                for pair in evidence_package.contradictions:
                    from app.pipeline.kg import Contradiction
                    graph_contradictions.append(
                        Contradiction(
                            fact_type=pair.left.factType,
                            label=pair.left.label,
                            left_value=pair.left.value,
                            right_value=pair.right.value,
                            left_document_id=str(pair.left.documentId),
                            right_document_id=str(pair.right.documentId),
                            left_source_page=pair.left.sourcePage,
                            right_source_page=pair.right.sourcePage,
                            left_source_chunk_id=str(pair.left.sourceChunkId) if pair.left.sourceChunkId else None,
                            right_source_chunk_id=str(pair.right.sourceChunkId) if pair.right.sourceChunkId else None,
                            workspace_id=str(workspace_id),
                        )
                    )

        verified_claims: list[VerifiedClaim] = []
        surviving_claims: list[VerifiedClaim] = []
        used_chunk_ids: set[uuid.UUID] = set()

        for claim in draft_answer.claims:
            if not claim.text or not claim.text.strip():
                continue

            # Check 1: Text support
            supported_by_text = False
            if claim.cited_evidence_id and claim.cited_evidence_id in chunk_map:
                passage = chunk_map[claim.cited_evidence_id].text
                supported_by_text = EvidenceTextMatcher.supports(claim.text, passage)
            else:
                # If no explicit citation, check against all chunks in evidence package
                for chunk in evidence_package.chunks:
                    if EvidenceTextMatcher.supports(claim.text, chunk.text):
                        supported_by_text = True
                        claim.cited_evidence_id = chunk.chunkId
                        break

            # Check 2: Graph support / contradiction check
            supported_by_graph = True
            if mode == AnswerMode.RETRIEVAL_PLUS_GRAPH and graph_contradictions:
                if self._graph_client.claim_conflicts_with_contradictions(claim.text, graph_contradictions):
                    supported_by_graph = False

            is_supported = supported_by_text and supported_by_graph

            vc = VerifiedClaim(
                text=claim.text,
                cited_evidence_id=claim.cited_evidence_id,
                supported_by_text=supported_by_text,
                supported_by_graph=supported_by_graph,
                is_supported=is_supported,
            )
            verified_claims.append(vc)

            if is_supported:
                surviving_claims.append(vc)
                if claim.cited_evidence_id:
                    used_chunk_ids.add(claim.cited_evidence_id)

        total_claims = len(verified_claims)
        supported_count = len(surviving_claims)

        logger.info(
            "Claim verification complete: total=%d, supported=%d, mode=%s",
            total_claims,
            supported_count,
            mode.value,
        )

        if supported_count == 0:
            logger.info("Zero claims survived verification; returning None for not-found")
            return None

        # Re-assemble final answer text from surviving claims
        final_answer_text = " ".join(c.text for c in surviving_claims).strip()

        # Build citations for surviving chunks
        citations: list[VerifiedCitation] = []
        for chunk_id in used_chunk_ids:
            if chunk_id in chunk_map:
                chunk = chunk_map[chunk_id]
                citations.append(
                    VerifiedCitation(
                        chunk_id=chunk.chunkId,
                        document_id=chunk.documentId,
                        document_name=chunk.documentName,
                        page_number=chunk.pageNumber,
                        section_heading=chunk.sectionHeading,
                        source_excerpt=chunk.text[:200],
                    )
                )

        # Compute confidence score
        base_ratio = supported_count / total_claims if total_claims > 0 else 0.0
        top_rerank = max((c.rerankScore for c in evidence_package.chunks), default=0.5) if evidence_package.chunks else 0.5
        confidence = round(min(1.0, max(0.1, (base_ratio * 0.7) + (top_rerank * 0.3))), 2)

        return VerifiedAnswer(
            answer_text=final_answer_text,
            claims=verified_claims,
            citations=citations,
            confidence=confidence,
            answer_mode=mode,
            is_not_found=False,
            reason=None,
        )
