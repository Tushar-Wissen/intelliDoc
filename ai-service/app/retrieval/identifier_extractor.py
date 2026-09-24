"""Verbatim terms that query rewriting must not drop (BR-006)."""

from __future__ import annotations

import re

_QUOTED = re.compile(r'"([^"]+)"')
_HYPHENATED = re.compile(r"\b[A-Za-z0-9]+(?:-[A-Za-z0-9]+){1,}\b")
_AMOUNT = re.compile(
    r"(?:[$€£]\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s?(?:USD|EUR|INR)\b)",
    re.I,
)
_DATE = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")


def extract_verbatim_terms(question: str) -> list[str]:
    terms: list[str] = []
    for match in _QUOTED.finditer(question):
        value = match.group(1).strip()
        if value:
            terms.append(value)
    for match in _HYPHENATED.finditer(question):
        token = match.group(0)
        if any(character.isdigit() for character in token):
            terms.append(token)
    terms.extend(match.group(0).strip() for match in _AMOUNT.finditer(question))
    terms.extend(match.group(0) for match in _DATE.finditer(question))
    unique: list[str] = []
    seen: set[str] = set()
    for term in terms:
        if term not in seen:
            seen.add(term)
            unique.append(term)
    return unique
