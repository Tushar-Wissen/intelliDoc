"""Shared helpers for OpenAI-compatible hosted LLM endpoints."""

from __future__ import annotations

import os


def normalize_hosted_base_url(base_url: str) -> str:
    """Strip trailing slashes and a duplicated /chat/completions suffix."""
    base = base_url.strip().rstrip("/")
    if base.endswith("/chat/completions"):
        base = base[: -len("/chat/completions")].rstrip("/")
    return base


def hosted_completions_url(base_url: str) -> str:
    return f"{normalize_hosted_base_url(base_url)}/chat/completions"


def float_env(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return float(raw)


def hosted_api_key() -> str:
    return os.getenv("HOSTED_LLM_API_KEY", "").strip()


def hosted_model() -> str:
    return os.getenv("HOSTED_LLM_MODEL", "gpt-4o-mini")


def hosted_timeout_seconds() -> float:
    return float_env("HOSTED_LLM_TIMEOUT_SECONDS", 120.0)


def hosted_base_url() -> str:
    return normalize_hosted_base_url(
        os.getenv("HOSTED_LLM_BASE_URL", "https://api.openai.com/v1")
    )


def require_hosted_api_key() -> str:
    api_key = hosted_api_key()
    if not api_key:
        raise ValueError(
            "HOSTED_LLM_API_KEY is not set. Add it to .env and restart ai-service."
        )
    return api_key
