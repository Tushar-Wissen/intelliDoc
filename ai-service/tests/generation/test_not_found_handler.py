"""Unit tests for NotFoundHandler (Story 7.3)."""

from app.generation.not_found_handler import NotFoundHandler


def test_not_found_handler_returns_canonical_response():
    response = NotFoundHandler.build(internal_reason="empty_evidence")

    assert response.isNotFound is True
    assert response.confidence is None
    assert response.reason == "No supporting evidence found in the selected documents."
    assert response.answerText == "No supporting evidence found in the selected documents."
    assert response.claims == []
    assert response.citations == []
