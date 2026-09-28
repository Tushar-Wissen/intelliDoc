"""Hosted LLM API provider implementation (Story 7.1)."""

from __future__ import annotations

import logging

import httpx

from app.generation.model_provider.base import CompletionResponse, ModelProviderInterface, ProviderError
from app.llm.hosted_config import hosted_completions_url, normalize_hosted_base_url

logger = logging.getLogger(__name__)


class HostedApiProvider(ModelProviderInterface):
    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str = "gpt-4o-mini",
        timeout_seconds: float = 120.0,
        default_temperature: float = 0.1,
    ) -> None:
        self._base_url = normalize_hosted_base_url(base_url)
        self._api_key = api_key.strip()
        self._model = model
        self._timeout = timeout_seconds
        self._default_temperature = default_temperature

    def generate(self, prompt: str, *, temperature: float | None = None) -> CompletionResponse:
        return self.generate_split(
            "You are a strict, grounded document assistant.",
            prompt,
            temperature=temperature,
        )

    def generate_split(
        self,
        system: str,
        user: str,
        *,
        temperature: float | None = None,
    ) -> CompletionResponse:
        if not self._api_key:
            raise ProviderError(
                "HOSTED_LLM_API_KEY is not set. Add it to .env and restart ai-service."
            )

        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": temperature if temperature is not None else self._default_temperature,
        }
        headers = {"Authorization": f"Bearer {self._api_key}"}

        try:
            response = httpx.post(
                hosted_completions_url(self._base_url),
                json=payload,
                headers=headers,
                timeout=self._timeout,
            )
            response.raise_for_status()
            body = response.json()
            choice = body["choices"][0]
            text = choice["message"]["content"]
            if not text or not text.strip():
                raise ProviderError("Hosted API returned an empty completion")
            return CompletionResponse(
                text=text,
                raw_response=body,
                finish_reason=choice.get("finish_reason"),
            )
        except ProviderError:
            raise
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            detail = _safe_error_body(exc.response)
            logger.error("Hosted API HTTP %s: %s", status, detail)
            raise ProviderError(f"Hosted API request failed with status {status}") from exc
        except Exception as exc:
            logger.error("Hosted API generation failed: %s", exc)
            raise ProviderError(f"Hosted API provider failed: {exc}") from exc


def _safe_error_body(response: httpx.Response) -> str:
    try:
        body = response.json()
        if isinstance(body, dict) and "error" in body:
            error = body["error"]
            if isinstance(error, dict):
                return str(error.get("message", error))
        return str(body)[:200]
    except Exception:
        return response.text[:200]
