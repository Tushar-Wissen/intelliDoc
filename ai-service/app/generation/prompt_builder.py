"""Evidence-only prompt builder for grounded answer generation (Story 7.1)."""

from __future__ import annotations

from app.retrieval.schemas import AnswerMode, EvidencePackage

SYSTEM_PROMPT = (
    "You are a strict, grounded document assistant.\n"
    "Your ONLY source of information is the evidence package the user provides.\n"
    "CRITICAL RULES:\n"
    "1. Answer using ONLY information found directly within the provided evidence.\n"
    "2. Do NOT use any general knowledge, outside assumptions, or training memory.\n"
    "3. If the provided evidence is insufficient or does not contain the answer, "
    "explicitly state: 'No supporting evidence found in the selected documents.'\n"
    "4. For every factual claim in your answer, tag the claim with its source chunk ID using "
    "the format '[chunk:<uuid>]' at the end of the sentence or claim.\n"
    "5. Do NOT invent chunk IDs or claim unsupported facts.\n"
    "6. Answer the user's question directly in 1-3 concise sentences unless they ask for a list.\n"
    "7. Do NOT dump, quote, or repeat large blocks of evidence text.\n"
    "8. Do NOT include unrelated information from the evidence.\n"
    "9. When the user asks for a list (e.g. 'three aspects'), return a short bullet list."
)


class PromptBuilder:
    @staticmethod
    def build_prompt_parts(question: str, evidence_package: EvidencePackage) -> tuple[str, str]:
        """Return (system_prompt, user_prompt) for chat-completions providers."""
        user_parts = ["=== EVIDENCE PACKAGE ==="]
        user_parts.extend(PromptBuilder._evidence_sections(evidence_package))
        user_parts.append("\n=== USER QUESTION ===")
        user_parts.append(question.strip())
        user_parts.append(
            "\nProvide a direct, concise grounded answer. "
            "Tag each factual claim with [chunk:<uuid>]."
        )
        return SYSTEM_PROMPT, "\n".join(user_parts)

    @staticmethod
    def build_prompt(question: str, evidence_package: EvidencePackage) -> str:
        system, user = PromptBuilder.build_prompt_parts(question, evidence_package)
        return f"{system}\n\n{user}"

    @staticmethod
    def _evidence_sections(evidence_package: EvidencePackage) -> list[str]:
        parts: list[str] = []
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
        return parts
