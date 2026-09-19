import json
import os
from typing import Any, Dict, Optional


class OpenAIWrapper:
    """Small provider wrapper for structured document classification."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        client: Any = None,
    ) -> None:
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.model = model or os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        self._client = client

    @property
    def enabled(self) -> bool:
        return bool(self.api_key or os.getenv("OPENAI_API_KEY") or self._client)

    def _get_client(self) -> Any:
        if self._client is not None:
            return self._client
        self.api_key = self.api_key or os.getenv("OPENAI_API_KEY")
        if not self.api_key:
            return None

        from openai import OpenAI

        self._client = OpenAI(api_key=self.api_key)
        return self._client

    def classify_document(self, content: str, document_types: list[str]) -> Optional[Dict[str, Any]]:
        """Ask OpenAI for a conservative document type and confidence."""
        client = self._get_client()
        if client is None:
            return None

        prompt = (
            "Classify this document by its actual business type. "
            "You may create a new concise snake_case document type; do not force it into the suggested types. "
            "Return JSON only with keys document_type, confidence, and reason. "
            "Use other only when the content is genuinely unclassifiable. Confidence must be between 0 and 1.\n\n"
            f"Suggested existing types: {', '.join(document_types)}\n\n"
            f"Document:\n{content[:12000]}"
        )
        response = client.chat.completions.create(
            model=self.model,
            temperature=0,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "You are a precise document classifier."},
                {"role": "user", "content": prompt},
            ],
        )
        raw_content = response.choices[0].message.content
        result = json.loads(raw_content)
        document_type = str(result.get("document_type", "other")).strip().lower()
        confidence = float(result.get("confidence", 0.0))
        return {
            "document_type": document_type,
            "confidence": max(0.0, min(confidence, 1.0)),
            "reason": str(result.get("reason", "")),
        }
