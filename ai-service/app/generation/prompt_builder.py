"""Evidence-only prompt builder for grounded answer generation (Story 7.1)."""

from __future__ import annotations

from app.retrieval.schemas import AnswerMode, EvidencePackage

SYSTEM_PROMPT = (
    "You are a strict, grounded document assistant.\n"
    "Your ONLY source of information is the provided evidence package below.\n"
    "CRITICAL RULES:\n"
    "1. Answer using ONLY information found directly within the provided evidence.\n"
    "2. Do NOT use any general knowledge, outside assumptions, or training memory.\n"
    "3. If the provided evidence is insufficient or does not contain the answer, "
    "explicitly state: 'No supporting evidence found in the selected documents.'\n"
    "4. For every factual claim in your answer, tag the claim with its source chunk ID using "
    "the format '[chunk:<uuid>]' at the end of the sentence or claim.\n"
    "5. Do NOT invent chunk IDs or claim unsupported facts."
)


class PromptBuilder:
    @staticmethod
    def build_prompt(question: str, evidence_package: EvidencePackage) -> str:
        parts = [SYSTEM_PROMPT, "\n=== EVIDENCE PACKAGE ==="]

        if not evidence_package.chunks:
            parts.append("EVIDENCE TEXT CHUNKS: None")
        else:
            parts.append("EVIDENCE TEXT CHUNKS:")
            for chunk in evidence_package.chunks:
                heading_info = f" ({chunk.sectionHeading})" if chunk.sectionHeading else ""
                page_info = f" [Page {chunk.pageNumber}]" if chunk.pageNumber is not None else ""
                parts.append(
                    f"[Chunk ID: {chunk.chunkId}]: {chunk.documentName}{heading_info}{page_info}\n"
                    f"{chunk.text.strip()}\n"
                )

        if evidence_package.answerMode == AnswerMode.RETRIEVAL_PLUS_GRAPH:
            parts.append("GRAPH FACTS & RELATIONSHIPS:")
            if not evidence_package.graphFacts:
                parts.append("None")
            else:
                for fact in evidence_package.graphFacts:
                    chunk_ref = f" [chunk:{fact.sourceChunkId}]" if fact.sourceChunkId else ""
                    parts.append(
                        f"- ({fact.subject}) -[{fact.relationship}]-> ({fact.object}) "
                        f"in {fact.factType}{chunk_ref}"
                    )

            if evidence_package.contradictions:
                parts.append("\nGRAPH CONTRADICTIONS DETECTED IN SCOPE:")
                for contradiction in evidence_package.contradictions:
                    parts.append(
                        f"- Conflict: {contradiction.left.label} has '{contradiction.left.value}' "
                        f"vs '{contradiction.right.value}'"
                    )

        parts.append("\n=== USER QUESTION ===")
        parts.append(question.strip())
        parts.append("\n=== GROUNDED ANSWER ===")

        return "\n".join(parts)
