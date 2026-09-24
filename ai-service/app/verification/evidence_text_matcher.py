"""Evidence text matcher for claim verification (Story 7.2)."""

from __future__ import annotations

import re


class EvidenceTextMatcher:
    """Checks whether a claim is supported by a raw evidence chunk passage."""

    _STOPWORDS = frozenset(
        {
            "a", "an", "the", "in", "on", "of", "for", "to", "and", "or", "is", "are",
            "was", "were", "be", "been", "by", "that", "this", "it", "as", "at", "with",
        }
    )

    @classmethod
    def supports(cls, claim_text: str, passage_text: str, min_overlap_ratio: float = 0.25) -> bool:
        if not claim_text or not passage_text:
            return False

        claim_norm = claim_text.lower()
        passage_norm = passage_text.lower()

        # Direct substring match
        if claim_norm in passage_norm:
            return True

        # Extract significant words (ignoring stopwords & short tokens)
        claim_words = [
            w for w in re.findall(r"\b[a-z0-9]+\b", claim_norm)
            if w not in cls._STOPWORDS and len(w) > 2
        ]

        if not claim_words:
            # If claim is very short or all stopwords, check substring
            return claim_norm.strip() in passage_norm

        passage_words = set(re.findall(r"\b[a-z0-9]+\b", passage_norm))
        matching_words = [w for w in claim_words if w in passage_words]

        overlap_ratio = len(matching_words) / len(claim_words)
        return overlap_ratio >= min_overlap_ratio
