"""Tests for hosted LLM URL normalization."""

from app.llm.hosted_config import hosted_completions_url, normalize_hosted_base_url


def test_normalize_hosted_base_url_strips_chat_completions_suffix():
    assert (
        normalize_hosted_base_url("https://integrate.api.nvidia.com/v1/chat/completions")
        == "https://integrate.api.nvidia.com/v1"
    )


def test_normalize_hosted_base_url_keeps_openai_style_base():
    assert normalize_hosted_base_url("https://api.openai.com/v1/") == "https://api.openai.com/v1"


def test_hosted_completions_url_appends_once():
    assert (
        hosted_completions_url("https://integrate.api.nvidia.com/v1/chat/completions")
        == "https://integrate.api.nvidia.com/v1/chat/completions"
    )
