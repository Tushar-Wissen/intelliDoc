"""Classification prompt. Document text is never included (Epic 6 §17)."""

from __future__ import annotations


def classification_prompt(
    *,
    question: str,
    scope_type: str,
    document_count: int,
    history: list[tuple[str, str]],
) -> str:
    history_lines = [f"- {role}: {content}" for role, content in history] or ["- none"]
    return (
        "Classify the user question and rewrite it for hybrid document search.\n"
        'Return JSON with keys "type" and "rewrittenQuery".\n'
        "type must be one of: fact, summary, comparison, cross-document.\n"
        "rewrittenQuery must keep identifiers, amounts, dates, and quoted phrases verbatim.\n"
        f"scopeType={scope_type}\n"
        f"documentCount={document_count}\n"
        "history:\n"
        + "\n".join(history_lines)
        + "\nQUESTION:\n"
        + question
    )
