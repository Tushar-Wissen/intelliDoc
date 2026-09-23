"""Injectable LLM JSON client for classification and extraction."""

from __future__ import annotations

import json
import logging
import os
import re
import uuid
from abc import ABC, abstractmethod
from typing import Any, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from app.pipeline.schemas.field_schemas import (
    ClassificationResultSchema,
    DocumentType,
    ProvenanceField,
    TYPE_SPECIFIC_FIELD_NAMES,
    TypeSpecificExtractionSchema,
    UniversalExtractionSchema,
    validate_provenance_fields,
)

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


class LlmError(Exception):
    """Malformed or unavailable LLM response."""


class StructuredLlmClient(ABC):
    @abstractmethod
    def complete_json(self, prompt: str, schema: type[T]) -> T:
        raise NotImplementedError


class CallableLlmClient(StructuredLlmClient):
    """Test double: supply a callable that returns a dict for the schema."""

    def __init__(self, fn) -> None:
        self._fn = fn

    def complete_json(self, prompt: str, schema: type[T]) -> T:
        raw = self._fn(prompt, schema)
        return schema.model_validate(raw)


class OllamaLlmClient(StructuredLlmClient):
    def __init__(
        self,
        base_url: str,
        model: str,
        timeout_seconds: float = 120.0,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._timeout = timeout_seconds

    def complete_json(self, prompt: str, schema: type[T]) -> T:
        payload = {
            "model": self._model,
            "prompt": prompt,
            "stream": False,
            "format": "json",
        }
        try:
            response = httpx.post(
                f"{self._base_url}/api/generate",
                json=payload,
                timeout=self._timeout,
            )
            response.raise_for_status()
            body = response.json()
            text = body.get("response", "")
            data = json.loads(text)
            return schema.model_validate(data)
        except (httpx.HTTPError, json.JSONDecodeError, ValidationError) as exc:
            raise LlmError(str(exc)) from exc


class RulesLlmClient(StructuredLlmClient):
    """Deterministic POC client when no hosted/local model is configured."""

    def complete_json(self, prompt: str, schema: type[T]) -> T:
        if schema is ClassificationResultSchema:
            return schema.model_validate(self._classify(prompt))
        if schema is UniversalExtractionSchema:
            fields = self._extract_universal(prompt)
            return UniversalExtractionSchema(fields=fields)
        if schema is TypeSpecificExtractionSchema:
            fields = self._extract_type_specific(prompt)
            return TypeSpecificExtractionSchema(fields=fields)
        raise LlmError(f"Unsupported schema for rules client: {schema}")

    def _classify(self, prompt: str) -> dict[str, Any]:
        lower = prompt.lower()
        if any(token in lower for token in ("revenue", "ebitda", "financial report", "forecast")):
            doc_type = DocumentType.FINANCIAL_REPORT
            confidence = 0.88
        elif any(token in lower for token in ("master services agreement", "termination", "contract")):
            doc_type = DocumentType.CONTRACT
            confidence = 0.93
        elif "proposal" in lower or "statement of work" in lower:
            doc_type = DocumentType.PROPOSAL
            confidence = 0.82
        elif "policy" in lower:
            doc_type = DocumentType.POLICY
            confidence = 0.8
        elif "ambiguous" in lower or len(lower.strip()) < 40:
            doc_type = DocumentType.OTHER
            confidence = 0.35
        else:
            doc_type = DocumentType.OTHER
            confidence = 0.55
        title = _first_line(prompt) or "Document"
        return {
            "documentType": doc_type.value,
            "confidence": confidence,
            "overview": f"Overview of {title[:120]}.",
            "summary": f"Summary covering key themes in {title[:80]}.",
        }

    def _extract_universal(self, prompt: str) -> list[ProvenanceField]:
        chunk_id, page, text = _parse_chunk_prompt(prompt)
        fields: list[ProvenanceField] = []
        title = _first_line(text)
        if title:
            fields.append(
                _field("Title", title, 0.9, page, chunk_id)
            )
        parties = _match_parties(text)
        if parties:
            fields.append(_field("Parties", parties, 0.97, page, chunk_id))
        effective = _match_date(text, label="Effective Date")
        if effective:
            fields.append(_field("Effective Date", effective, 0.97, page, chunk_id))
        for label, value in _match_amounts(text):
            fields.append(_field("Amounts", f"{label}: {value}", 0.85, page, chunk_id))
        ref = _match_reference(text)
        if ref:
            fields.append(_field("Reference Numbers", ref, 0.8, page, chunk_id))
        topics = _match_topics(text)
        if topics:
            fields.append(_field("Topics", topics, 0.75, page, chunk_id))
        return validate_provenance_fields(fields)

    def _extract_type_specific(self, prompt: str) -> list[ProvenanceField]:
        doc_type = _parse_document_type(prompt)
        chunk_id, page, text = _parse_chunk_prompt(prompt)
        names = TYPE_SPECIFIC_FIELD_NAMES.get(doc_type, [])
        if not names:
            return []
        fields: list[ProvenanceField] = []
        lower = text.lower()
        if doc_type == DocumentType.CONTRACT:
            if "obligation" in lower or "shall" in lower:
                fields.append(_field("Obligations", "Perform services per agreement.", 0.84, page, chunk_id))
            if "termination" in lower or "notice" in lower:
                notice = _match_notice_period(text)
                value = notice or "30 days"
                fields.append(_field("Termination Terms", value, 0.81, page, chunk_id))
                if notice:
                    fields.append(_field("Termination Notice Period", notice, 0.81, page, chunk_id))
        elif doc_type == DocumentType.FINANCIAL_REPORT:
            revenue = _match_labeled_amount(text, "revenue")
            if revenue:
                fields.append(_field("Revenue", revenue, 0.92, page, chunk_id))
            ebitda = _match_labeled_amount(text, "ebitda")
            if ebitda:
                fields.append(_field("EBITDA", ebitda, 0.9, page, chunk_id))
            period = _match_after_label(text, "forecast period")
            if period:
                fields.append(_field("Forecast Period", period, 0.86, page, chunk_id))
            reporting = _match_after_label(text, "reporting period")
            if reporting:
                fields.append(_field("Reporting Period", reporting, 0.86, page, chunk_id))
        elif doc_type == DocumentType.PROPOSAL:
            customer = _match_after_label(text, "customer")
            if customer:
                fields.append(_field("Customer", customer, 0.8, page, chunk_id))
            offering = _match_after_label(text, "offering")
            if offering:
                fields.append(_field("Offering", offering, 0.8, page, chunk_id))
            price = _match_labeled_amount(text, "price")
            if price:
                fields.append(_field("Price", price, 0.78, page, chunk_id))
        elif doc_type == DocumentType.POLICY:
            scope = _match_after_label(text, "policy scope")
            if scope:
                fields.append(_field("Policy Scope", scope, 0.77, page, chunk_id))
            owner = _match_after_label(text, "policy owner")
            if owner:
                fields.append(_field("Policy Owner", owner, 0.77, page, chunk_id))
        return validate_provenance_fields(fields)


_default_client: StructuredLlmClient | None = None


def get_llm_client() -> StructuredLlmClient:
    global _default_client
    if _default_client is None:
        _default_client = build_llm_client()
    return _default_client


def set_llm_client(client: StructuredLlmClient | None) -> None:
    global _default_client
    _default_client = client


def build_llm_client() -> StructuredLlmClient:
    provider = os.getenv("LLM_PROVIDER", "rules").strip().lower()
    if provider == "ollama":
        base = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        model = os.getenv("OLLAMA_MODEL", "llama3.2")
        return OllamaLlmClient(base_url=base, model=model)
    return RulesLlmClient()


def with_retry(fn, *, retries: int = 1):
    last: Exception | None = None
    for attempt in range(retries + 1):
        try:
            return fn()
        except (LlmError, ValidationError) as exc:
            last = exc
            logger.warning("LLM attempt %s failed: %s", attempt + 1, exc)
    assert last is not None
    raise last


def _field(name: str, value: str, confidence: float, page: int, chunk_id: uuid.UUID) -> ProvenanceField:
    return ProvenanceField(
        fieldName=name,
        fieldValue=value,
        confidence=confidence,
        sourcePage=page,
        sourceChunkId=chunk_id,
    )


def _parse_chunk_prompt(prompt: str) -> tuple[uuid.UUID, int, str]:
    chunk_match = re.search(r"chunkId=([0-9a-f-]{36})", prompt, re.I)
    page_match = re.search(r"page=(\d+)", prompt, re.I)
    text_match = re.search(r"---\n(.+)\Z", prompt, re.S)
    chunk_id = uuid.UUID(chunk_match.group(1)) if chunk_match else uuid.uuid4()
    page = int(page_match.group(1)) if page_match else 1
    text = text_match.group(1).strip() if text_match else prompt
    return chunk_id, page, text


def _parse_document_type(prompt: str) -> DocumentType:
    match = re.search(r"documentType=([a-z_]+)", prompt, re.I)
    if not match:
        return DocumentType.OTHER
    try:
        return DocumentType(match.group(1).lower())
    except ValueError:
        return DocumentType.OTHER


def _first_line(text: str) -> str:
    for line in text.splitlines():
        cleaned = line.strip()
        if cleaned:
            return cleaned
    return ""


def _match_parties(text: str) -> str | None:
    match = re.search(
        r"parties?:\s*([^\n.]+)",
        text,
        re.I,
    )
    if match:
        return match.group(1).strip()
    corps = re.findall(r"\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*\s+(?:Corp|Ltd|LLC|Inc)\.?)\b", text)
    if corps:
        return ", ".join(dict.fromkeys(corps))
    return None


def _match_date(text: str, label: str) -> str | None:
    pattern = rf"{re.escape(label)}[:\s]+(\d{{4}}-\d{{2}}-\d{{2}})"
    match = re.search(pattern, text, re.I)
    if match:
        return match.group(1)
    generic = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", text)
    return generic.group(1) if generic else None


def _match_amounts(text: str) -> list[tuple[str, str]]:
    results: list[tuple[str, str]] = []
    for match in re.finditer(r"([A-Za-z ]{3,30}):\s*(\$[\d,]+(?:\.\d{2})?)", text):
        results.append((match.group(1).strip(), match.group(2)))
    return results


def _match_reference(text: str) -> str | None:
    match = re.search(r"\b(?:ref(?:erence)?|agreement)\s*(?:#|no\.?)?\s*([A-Z0-9-]{4,})\b", text, re.I)
    return match.group(1) if match else None


def _match_topics(text: str) -> str | None:
    match = re.search(r"topics?:\s*([^\n]+)", text, re.I)
    return match.group(1).strip() if match else None


def _match_notice_period(text: str) -> str | None:
    match = re.search(r"(\d+\s+days?)\s+(?:written\s+)?notice", text, re.I)
    return match.group(1) if match else None


def _match_labeled_amount(text: str, label: str) -> str | None:
    match = re.search(rf"{label}\s*[:\s]+\$?([\d,]+(?:\.\d{{2}})?)", text, re.I)
    return match.group(1) if match else None


def _match_after_label(text: str, label: str) -> str | None:
    match = re.search(rf"{label}\s*[:\s]+([^\n.]+)", text, re.I)
    return match.group(1).strip() if match else None
