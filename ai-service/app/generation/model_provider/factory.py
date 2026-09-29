"""Factory for swappable LLM provider selection (Story 7.1 AC2)."""

from __future__ import annotations

import os

from app.generation.model_provider.base import ModelProviderInterface
from app.generation.model_provider.hosted_provider import HostedApiProvider
from app.generation.model_provider.ollama_provider import OllamaProvider
from app.generation.model_provider.rules_provider import RulesProvider

_override_provider: ModelProviderInterface | None = None


def get_model_provider() -> ModelProviderInterface:
    global _override_provider
    if _override_provider is not None:
        return _override_provider

    provider_type = os.getenv("LLM_PROVIDER", "rules").strip().lower()
    if provider_type == "ollama":
        base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        model = os.getenv("OLLAMA_MODEL", "llama3.2")
        return OllamaProvider(base_url=base_url, model=model)
    elif provider_type == "hosted":
        base_url = os.getenv("HOSTED_LLM_BASE_URL", "https://api.openai.com/v1")
        api_key = os.getenv("HOSTED_LLM_API_KEY", "")
        model = os.getenv("HOSTED_LLM_MODEL", "gpt-4o-mini")
        return HostedApiProvider(base_url=base_url, api_key=api_key, model=model)
    else:
        return RulesProvider()


def set_model_provider(provider: ModelProviderInterface | None) -> None:
    global _override_provider
    _override_provider = provider
