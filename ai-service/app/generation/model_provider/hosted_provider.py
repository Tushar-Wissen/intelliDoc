"""Hosted LLM API provider implementation (Story 7.1)."""

from __future__ import annotations

import logging
import httpx

from app.generation.model_provider.base import CompletionResponse, ModelProviderInterface, ProviderError

logger = logging.getLogger(__name__)


class HostedApiProvider(ModelProviderInterface):
    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str = "gpt-4o-mini",
        timeout_seconds: float = 120.0,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._model = model
        self._timeout = timeout_seconds

    def generate(self, prompt: str, *, temperature: float | None = None) -> CompletionResponse:
        payload = {
            "model": self._model,
            "messages": [{"role": "user", "content": prompt}],
        }
        if temperature is not None:
            payload["temperature"] = temperature

        headers = {"Authorization": f"Bearer {self._api_key}"} if self._api_key else {}

        try:
            response = httpx.post(
                f"{self._base_url}/chat/completions",
                json=payload,
                headers=headers,
                timeout=self._timeout,
            )
            response.raise_for_status()
            body = response.json()
            choice = body["choices"][0]
            text = choice["message"]["content"]
            return CompletionResponse(
                text=text,
                raw_response=body,
                finish_reason=choice.get("finish_reason"),
            )
        except Exception as exc:
            logger.error("Hosted API generation failed: %s", exc)
            raise ProviderError(f"Hosted API provider failed: {exc}") from exc
