"""Grounded answer generation service (Story 7.1)."""

from __future__ import annotations

import logging
import re
import uuid
from dataclasses import dataclass, field

from app.generation.model_provider.base import ModelProviderInterface, ProviderError
from app.generation.model_provider.factory import get_model_provider
from app.generation.prompt_builder import PromptBuilder
from app.retrieval.schemas import EvidencePackage

logger = logging.getLogger(__name__)


@dataclass
class DraftClaim:
    text: str
    cited_evidence_id: uuid.UUID | None = None


@dataclass
class DraftAnswer:
    text: str
    claims: list[DraftClaim] = field(default_factory=list)


class GenerationError(Exception):
    """Internal failure during generation (retry exceeded or unparseable output)."""


class AnswerGenerationService:
    def __init__(self, provider: ModelProviderInterface | None = None) -> None:
        self._provider = provider

    def generate_answer(
        self,
        question: str,
        evidence_package: EvidencePackage,
        *,
        max_retries: int = 1,
    ) -> DraftAnswer | None:
        """Generate a draft grounded answer from an evidence package.

        Returns None if evidence package is empty or uninformative (triggers not-found).
        Raises ProviderError on infrastructure/HTTP failures.
        """
        if not evidence_package.chunks:
            logger.info("Empty evidence package chunks; short-circuiting to not-found")
            return None

        prompt = PromptBuilder.build_prompt(question, evidence_package)
        provider = self._provider or get_model_provider()

        last_error: Exception | None = None
        for attempt in range(max_retries + 1):
            try:
                response = provider.generate(prompt)
                draft = self._parse_draft_answer(response.text, evidence_package)
                if draft is not None:
                    return draft
                logger.warning("Attempt %d produced unparseable draft answer", attempt + 1)
            except ProviderError:
                raise
            except Exception as exc:
                last_error = exc
                logger.warning("Generation attempt %d failed: %s", attempt + 1, exc)

        logger.warning("All generation attempts exhausted; falling back to not-found")
        return None

    def _parse_draft_answer(self, response_text: str, evidence_package: EvidencePackage) -> DraftAnswer | None:
        text = response_text.strip()
        if not text or "no supporting evidence found" in text.lower():
            return None

        valid_chunk_ids = {chunk.chunkId for chunk in evidence_package.chunks}
        default_chunk_id = evidence_package.chunks[0].chunkId if evidence_package.chunks else None

        # Standardize tag formatting: move [chunk:uuid] inside sentence before punctuation if needed
        # e.g. "Sentence. [chunk:uuid]" -> "Sentence [chunk:uuid]."
        normalized_text = re.sub(
            r"\.\s*\[chunk:([0-9a-f-]{36})\]",
            r" [chunk:\1].",
            text,
            flags=re.I,
        )

        sentences = re.split(r"(?<=[.!?])\s+", normalized_text)
        claims: list[DraftClaim] = []

        for sentence in sentences:
            sentence_text = sentence.strip()
            if not sentence_text or sentence_text.startswith("[chunk:"):
                continue

            chunk_tags = re.findall(r"\[chunk:([0-9a-f-]{36})\]", sentence_text, re.I)
            cleaned_text = re.sub(r"\[chunk:[0-9a-f-]{36}\]", "", sentence_text, flags=re.I).strip()
            # Clean up duplicate spaces or trailing punctuation spaces
            cleaned_text = re.sub(r"\s+", " ", cleaned_text).strip()

            cited_id: uuid.UUID | None = None
            if chunk_tags:
                try:
                    parsed_id = uuid.UUID(chunk_tags[0])
                    if parsed_id in valid_chunk_ids:
                        cited_id = parsed_id
                except ValueError:
                    pass

            if cited_id is None and len(valid_chunk_ids) == 1:
                cited_id = default_chunk_id

            if cleaned_text:
                claims.append(DraftClaim(text=cleaned_text, cited_evidence_id=cited_id))

        if not claims:
            return None

        return DraftAnswer(text=text, claims=claims)
