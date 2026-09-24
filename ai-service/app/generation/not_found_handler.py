"""Canonical Not-Found handler (Story 7.3)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class NotFoundResponse:
    isNotFound: bool = True
    reason: str = "No supporting evidence found in the selected documents."
    confidence: float | None = None
    answerText: str = "No supporting evidence found in the selected documents."
    claims: list[dict[str, Any]] = field(default_factory=list)
    citations: list[dict[str, Any]] = field(default_factory=list)

    def to_dict() -> dict[str, Any]:
        return {
            "isNotFound": self.isNotFound,
            "reason": self.reason,
            "confidence": self.confidence,
            "answerText": self.answerText,
            "claims": self.claims,
            "citations": self.citations,
        }


class NotFoundHandler:
    CANONICAL_REASON = "No supporting evidence found in the selected documents."

    @classmethod
    def build(cls, internal_reason: str | None = None) -> NotFoundResponse:
        return NotFoundResponse(
            isNotFound=True,
            reason=cls.CANONICAL_REASON,
            confidence=None,
            answerText=cls.CANONICAL_REASON,
            claims=[],
            citations=[],
        )
