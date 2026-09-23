"""Chunk sizing tokenizer.

ASSUMPTION (§27): source docs do not name a tokenizer. Chunk sizing uses a
BGE-M3-like wordpiece approximation (word + punctuation tokens) so Epic 4
embeddings are not required at parse time.
"""

from __future__ import annotations

import re

_TOKEN_RE = re.compile(r"\w+|[^\w\s]", re.UNICODE)


def count_tokens(text: str) -> int:
    if not text or not text.strip():
        return 0
    return max(1, len(_TOKEN_RE.findall(text)))
