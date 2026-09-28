"""Unit tests for model providers and config-driven selection (Story 7.1 AC2)."""

import os
from unittest.mock import MagicMock, patch

import pytest

from app.generation.model_provider.base import ProviderError
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


def test_hosted_provider_requires_api_key():
    provider = HostedApiProvider(
        base_url="https://api.openai.com/v1",
        api_key="",
        model="gpt-4o-mini",
    )
    with pytest.raises(ProviderError, match="HOSTED_LLM_API_KEY"):
        provider.generate_split("system", "user")


def test_hosted_provider_normalizes_base_url_with_chat_completions_suffix():
    provider = HostedApiProvider(
        base_url="https://integrate.api.nvidia.com/v1/chat/completions",
        api_key="test-key",
        model="gpt-4o-mini",
    )
    mock_response = MagicMock()
    mock_response.raise_for_status.return_value = None
    mock_response.json.return_value = {
        "choices": [{"message": {"content": "ok"}, "finish_reason": "stop"}]
    }

    with patch("app.generation.model_provider.hosted_provider.httpx.post", return_value=mock_response) as post:
        provider.generate_split("system", "user")

    assert post.call_args.args[0] == "https://integrate.api.nvidia.com/v1/chat/completions"


def test_hosted_provider_calls_chat_completions():
    provider = HostedApiProvider(
        base_url="https://api.openai.com/v1",
        api_key="test-key",
        model="gpt-4o-mini",
        default_temperature=0.1,
    )
    mock_response = MagicMock()
    mock_response.raise_for_status.return_value = None
    mock_response.json.return_value = {
        "choices": [{"message": {"content": "The notice period is 30 days [chunk:123]."}, "finish_reason": "stop"}]
    }

    with patch("app.generation.model_provider.hosted_provider.httpx.post", return_value=mock_response) as post:
        result = provider.generate_split("You are helpful.", "What is the notice period?")

    assert "30 days" in result.text
    post.assert_called_once()
    payload = post.call_args.kwargs["json"]
    assert payload["model"] == "gpt-4o-mini"
    assert payload["messages"][0]["role"] == "system"
    assert payload["messages"][1]["role"] == "user"
    assert payload["temperature"] == 0.1
