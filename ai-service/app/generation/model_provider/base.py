"""Base model provider interface for LLM calls (Story 7.1)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


class ProviderError(Exception):
    """Infrastructure error when contacting LLM provider."""


@dataclass
class CompletionResponse:
    text: str
    raw_response: dict[str, Any] | None = None
    finish_reason: str | None = None


class ModelProviderInterface(ABC):
    @abstractmethod
    def generate(self, prompt: str, *, temperature: float | None = None) -> CompletionResponse:
        """Generate text completion from prompt. Raises ProviderError on network/HTTP failure."""
        raise NotImplementedError

    def generate_split(
        self,
        system: str,
        user: str,
        *,
        temperature: float | None = None,
    ) -> CompletionResponse:
        """Generate from separate system and user prompts. Defaults to a single combined prompt."""
        return self.generate(f"{system}\n\n{user}", temperature=temperature)
