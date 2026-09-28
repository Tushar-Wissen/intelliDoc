"""Factory for swappable LLM provider selection (Story 7.1 AC2)."""

from __future__ import annotations

import os

from app.generation.model_provider.base import ModelProviderInterface
from app.generation.model_provider.hosted_provider import HostedApiProvider
from app.generation.model_provider.ollama_provider import OllamaProvider
from app.generation.model_provider.rules_provider import RulesProvider
from app.llm.hosted_config import float_env, hosted_api_key, hosted_base_url, hosted_model

_override_provider: ModelProviderInterface | None = None


def get_model_provider() -> ModelProviderInterface:
    global _override_provider
    if _override_provider is not None:
        return _override_provider

    provider_type = os.getenv("LLM_PROVIDER", "rules").strip().lower()
    if provider_type == "ollama":
        base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        model = os.getenv("OLLAMA_MODEL", "llama3.2")
        timeout = float_env("OLLAMA_TIMEOUT_SECONDS", 120.0)
        return OllamaProvider(base_url=base_url, model=model, timeout_seconds=timeout)
    if provider_type == "hosted":
        base_url = hosted_base_url()
        api_key = hosted_api_key()
        model = hosted_model()
        timeout = float_env("HOSTED_LLM_TIMEOUT_SECONDS", 120.0)
        temperature = float_env("HOSTED_LLM_TEMPERATURE", 0.1)
        return HostedApiProvider(
            base_url=base_url,
            api_key=api_key,
            model=model,
            timeout_seconds=timeout,
            default_temperature=temperature,
        )
    return RulesProvider()


def get_model_provider_name() -> str:
    if _override_provider is not None:
        return type(_override_provider).__name__
    return os.getenv("LLM_PROVIDER", "rules").strip().lower()


def set_model_provider(provider: ModelProviderInterface | None) -> None:
    global _override_provider
    _override_provider = provider
