from __future__ import annotations

from app.llm.client import (
    HostedLlmClient,
    RulesLlmClient,
    build_summary_llm_client,
    get_rules_llm_client,
)


def test_get_rules_llm_client_returns_rules():
    assert isinstance(get_rules_llm_client(), RulesLlmClient)


def test_build_summary_llm_client_defaults_to_hosted_when_api_key_set(monkeypatch):
    monkeypatch.delenv("SUMMARY_LLM_PROVIDER", raising=False)
    monkeypatch.setenv("HOSTED_LLM_API_KEY", "test-key")
    assert isinstance(build_summary_llm_client(), HostedLlmClient)


def test_build_summary_llm_client_uses_rules_without_api_key(monkeypatch):
    monkeypatch.delenv("SUMMARY_LLM_PROVIDER", raising=False)
    monkeypatch.setenv("HOSTED_LLM_API_KEY", "")
    assert isinstance(build_summary_llm_client(), RulesLlmClient)
