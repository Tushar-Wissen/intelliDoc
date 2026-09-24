"""Rules-based deterministic provider implementation for testing/CI (Story 7.1)."""

from __future__ import annotations

import re

from app.generation.model_provider.base import CompletionResponse, ModelProviderInterface


class RulesProvider(ModelProviderInterface):
    """Deterministic LLM double for testing when LLM_PROVIDER=rules."""

    def generate(self, prompt: str, *, temperature: float | None = None) -> CompletionResponse:
        # Extract evidence chunk IDs and text from prompt
        chunk_matches = re.findall(r"\[Chunk ID: ([0-9a-f-]{36})\]: (.*?)(?=\n\[Chunk ID:|\nGRAPH FACTS:|\nUSER QUESTION:|\Z)", prompt, re.S)

        if not chunk_matches:
            return CompletionResponse(text="No supporting evidence found in the selected documents.")

        claims = []
        for chunk_id, text in chunk_matches:
            lines = [l.strip() for l in text.splitlines() if l.strip()]
            for line in lines:
                if len(line) > 10:
                    claims.append(f"{line} [chunk:{chunk_id}]")

        if not claims:
            return CompletionResponse(text="No supporting evidence found in the selected documents.")

        answer_text = " ".join(claims[:3])
        return CompletionResponse(text=answer_text)
