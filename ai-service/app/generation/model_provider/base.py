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
