"""Ollama local LLM provider implementation (Story 7.1)."""

from __future__ import annotations

import logging
import httpx

from app.generation.model_provider.base import CompletionResponse, ModelProviderInterface, ProviderError

logger = logging.getLogger(__name__)


class OllamaProvider(ModelProviderInterface):
    def __init__(
        self,
        base_url: str = "http://localhost:11434",
        model: str = "llama3.2",
        timeout_seconds: float = 120.0,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._timeout = timeout_seconds

    def generate(self, prompt: str, *, temperature: float | None = None) -> CompletionResponse:
        payload = {
            "model": self._model,
            "prompt": prompt,
            "stream": False,
        }
        if temperature is not None:
            payload["options"] = {"temperature": temperature}

        try:
            response = httpx.post(
                f"{self._base_url}/api/generate",
                json=payload,
                timeout=self._timeout,
            )
            response.raise_for_status()
            body = response.json()
            text = body.get("response", "")
            return CompletionResponse(text=text, raw_response=body, finish_reason=body.get("done_reason"))
        except Exception as exc:
            logger.error("Ollama generation failed: %s", exc)
            raise ProviderError(f"Ollama provider failed: {exc}") from exc
