"""Grounded answer generation service (Story 7.1)."""

from __future__ import annotations

import logging
import re
import uuid
from dataclasses import dataclass, field

from app.generation.model_provider.base import ModelProviderInterface, ProviderError
from app.generation.model_provider.factory import get_model_provider, get_model_provider_name
from app.generation.prompt_builder import PromptBuilder
from app.retrieval.schemas import EvidencePackage

logger = logging.getLogger(__name__)


@dataclass
class DraftClaim:
    text: str
    cited_evidence_id: uuid.UUID | None = None
    block_index: int = 0
    list_marker: str | None = None


@dataclass
class DraftAnswer:
    text: str
    claims: list[DraftClaim] = field(default_factory=list)


class GenerationError(Exception):
    """Internal failure during generation (retry exceeded or unparseable output)."""


class AnswerGenerationService:
    _CHUNK_TAG = re.compile(r"\[chunk:([0-9a-f-]{36})\]", re.I)
    _INTERNAL_METADATA = re.compile(
        r"\[(?:chunk\s*id|page|section)(?:\s*[:#])?\s*[^\]]*\]"
        r"|\b(?:chunk\s*(?:id|uuid)|sourceChunkId)\s*[:=]\s*[0-9a-f-]{8,}\b",
        re.I,
    )

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

        system_prompt, user_prompt = PromptBuilder.build_prompt_parts(question, evidence_package)
        provider = self._provider or get_model_provider()
        chunk_ids = [str(chunk.chunkId) for chunk in evidence_package.chunks]
        logger.info(
            "Generating answer provider=%s evidenceChunks=%s chunkIds=%s",
            get_model_provider_name(),
            len(evidence_package.chunks),
            chunk_ids,
        )

        last_error: Exception | None = None
        for attempt in range(max_retries + 1):
            try:
                response = provider.generate_split(system_prompt, user_prompt)
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
        claims: list[DraftClaim] = []
        output_blocks: list[str] = []
        paragraph_lines: list[str] = []
        block_index = 0

        def add_claim(raw_text: str, index: int, list_marker: str | None = None) -> None:
            tags = self._CHUNK_TAG.findall(raw_text)
            cleaned = self._CHUNK_TAG.sub("", raw_text)
            cleaned = self._INTERNAL_METADATA.sub("", cleaned)
            cleaned = re.sub(r"\s+", " ", cleaned).strip()
            cited_id = None
            for tag in tags:
                try:
                    parsed_id = uuid.UUID(tag)
                except ValueError:
                    continue
                if parsed_id in valid_chunk_ids:
                    cited_id = parsed_id
                    break
            if cleaned and not re.fullmatch(r"(?:chunk|section|page)(?:\s+details?)?", cleaned, re.I):
                claims.append(
                    DraftClaim(
                        text=cleaned,
                        cited_evidence_id=cited_id,
                        block_index=index,
                        list_marker=list_marker,
                    )
                )

        def flush_paragraph() -> None:
            nonlocal block_index
            if not paragraph_lines:
                return
            paragraph = re.sub(r"\s+", " ", " ".join(paragraph_lines)).strip()
            paragraph_lines.clear()
            output_blocks.append(paragraph)
            citation_attached = re.sub(
                r"([.!?])\s*(\[chunk:[0-9a-f-]{36}\])",
                r" \2\1",
                paragraph,
                flags=re.I,
            )
            for sentence in re.split(r"(?<=[.!?])\s+", citation_attached):
                add_claim(sentence, block_index)
            block_index += 1

        for raw_line in text.splitlines():
            line = raw_line.strip()
            if not line:
                flush_paragraph()
                continue

            list_match = re.match(r"^(?P<marker>(?:[-*•]|\d+[.)])\s+)(?P<body>.+)$", line)
            if list_match:
                flush_paragraph()
                marker = list_match.group("marker").strip()
                body = list_match.group("body").strip()
                display_body = self._CHUNK_TAG.sub("", body)
                display_body = self._INTERNAL_METADATA.sub("", display_body)
                display_body = re.sub(r"\s+", " ", display_body).strip()
                if display_body:
                    output_blocks.append(f"{marker} {display_body}")
                add_claim(body, block_index, marker)
                block_index += 1
                continue

            # A heading is formatting, not a factual claim. The prompt asks the
            # model to avoid headings unless the question explicitly needs one.
            if re.match(r"^#{1,6}\s+", line):
                flush_paragraph()
                continue
            paragraph_lines.append(line)
        flush_paragraph()

        if not claims:
            return None

        # This text is retained for diagnostics only; remove raw source IDs and
        # metadata even if the provider ignored the prompt instruction.
        safe_text = "\n\n".join(output_blocks)
        safe_text = self._CHUNK_TAG.sub("", safe_text)
        safe_text = self._INTERNAL_METADATA.sub("", safe_text)
        return DraftAnswer(text=safe_text.strip(), claims=claims)
