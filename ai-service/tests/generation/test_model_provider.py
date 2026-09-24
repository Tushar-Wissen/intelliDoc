"""Unit tests for model providers and config-driven selection (Story 7.1 AC2)."""

import os
from unittest.mock import patch

from app.generation.model_provider.base import ModelProviderInterface
from app.generation.model_provider.factory import get_model_provider, set_model_provider
from app.generation.model_provider.hosted_provider import HostedApiProvider
from app.generation.model_provider.ollama_provider import OllamaProvider
from app.generation.model_provider.rules_provider import RulesProvider


def test_provider_factory_switches_on_config():
    set_model_provider(None)

    with patch.dict(os.environ, {"LLM_PROVIDER": "ollama"}):
        provider = get_model_provider()
        assert isinstance(provider, OllamaProvider)

    with patch.dict(os.environ, {"LLM_PROVIDER": "hosted"}):
        provider = get_model_provider()
        assert isinstance(provider, HostedApiProvider)

    with patch.dict(os.environ, {"LLM_PROVIDER": "rules"}):
        provider = get_model_provider()
        assert isinstance(provider, RulesProvider)


def test_rules_provider_generates_completion():
    provider = RulesProvider()
    chunk_id = "12345678-1234-5678-1234-567812345678"
    prompt = f"[Chunk ID: {chunk_id}]: contract.pdf\nThis contract has a 30 day termination notice.\nUSER QUESTION:\nWhat is notice?"

    res = provider.generate(prompt)
    assert res.text
    assert "30 day termination notice" in res.text
    assert chunk_id in res.text
