"""Swappable LLM entry point owned by Epic 5 (Decision A).

Epic 3 already implements the client (`app.llm.client`). This module is the
interface Epic 7 must import. It does not create a second client stack.
"""

from __future__ import annotations

from app.llm.client import StructuredLlmClient, build_llm_client, get_llm_client

__all__ = ["StructuredLlmClient", "build_llm_client", "get_llm_client"]
