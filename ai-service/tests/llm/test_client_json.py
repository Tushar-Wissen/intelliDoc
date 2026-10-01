"""Tests for hosted LLM JSON parsing helpers."""

from app.llm.client import _parse_json_object


def test_parse_json_object_from_markdown_fence():
    content = '```json\n{"type": "fact", "rewrittenQuery": "notice period"}\n```'
    parsed = _parse_json_object(content)
    assert parsed["type"] == "fact"
    assert parsed["rewrittenQuery"] == "notice period"
