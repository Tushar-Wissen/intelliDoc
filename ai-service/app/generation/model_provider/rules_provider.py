"""Rules-based deterministic provider implementation for testing/CI (Story 7.1)."""

from __future__ import annotations

import re

from app.generation.model_provider.base import CompletionResponse, ModelProviderInterface


class RulesProvider(ModelProviderInterface):
    """Deterministic LLM double for testing when LLM_PROVIDER=rules."""

    _EVIDENCE_CHUNK = re.compile(
        r"\[\[EVIDENCE_CHUNK id=[0-9a-f-]{36}\]\]\s*"
        r"Source metadata \(for grounding only; never repeat\):[^\n]*\n"
        r"Text:\s*\n(.*?)\n\[\[/EVIDENCE_CHUNK\]\]",
        re.IGNORECASE | re.DOTALL,
    )

    def generate(self, prompt: str, *, temperature: float | None = None) -> CompletionResponse:
        # Read only the delimited source text. Never echo storage metadata or IDs.
        evidence_chunks = self._EVIDENCE_CHUNK.findall(prompt)
        if not evidence_chunks:
            return CompletionResponse(text="No supporting evidence found in the selected documents.")

        content = evidence_chunks[0].strip()
        if not content:
            return CompletionResponse(text="No supporting evidence found in the selected documents.")

        lines = [line.strip() for line in content.splitlines() if line.strip()]
        bullet_lines = [line for line in lines if re.match(r"^(?:[-*•]|\d+[.)])\s+", line)]
        if bullet_lines:
            answer_lines = [re.sub(r"^(?:[-*•]|\d+[.)])\s+", "", line) for line in bullet_lines[:5]]
            answer_text = "\n".join(f"- {line}" for line in answer_lines if len(line) > 2)
        else:
            # Keep the deterministic fallback concise; it is not intended to
            # synthesize an answer like a hosted model.
            sentences = re.split(r"(?<=[.!?])\s+", " ".join(lines))
            answer_text = " ".join(sentence.strip() for sentence in sentences[:3] if sentence.strip())

        if not answer_text.strip():
            return CompletionResponse(text="No supporting evidence found in the selected documents.")
        return CompletionResponse(text=answer_text)
