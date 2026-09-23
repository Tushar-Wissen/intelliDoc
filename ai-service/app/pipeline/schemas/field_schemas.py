"""Pydantic schemas for Epic 3 classification and extraction (Story 3.1–3.3)."""

from __future__ import annotations

from enum import Enum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class DocumentType(str, Enum):
    CONTRACT = "contract"
    PROPOSAL = "proposal"
    FINANCIAL_REPORT = "financial_report"
    POLICY = "policy"
    OTHER = "other"


class ClassificationResultSchema(BaseModel):
    document_type: DocumentType = Field(alias="documentType")
    confidence: float = Field(ge=0.0, le=1.0)
    overview: str = Field(min_length=1)
    summary: str = Field(min_length=1)

    model_config = {"populate_by_name": True}


class ProvenanceField(BaseModel):
    field_name: str = Field(alias="fieldName", min_length=1)
    field_value: str = Field(alias="fieldValue", min_length=1)
    confidence: float = Field(ge=0.0, le=1.0)
    source_page: int = Field(alias="sourcePage", ge=1)
    source_chunk_id: UUID = Field(alias="sourceChunkId")

    model_config = {"populate_by_name": True}


class UniversalExtractionSchema(BaseModel):
    fields: list[ProvenanceField] = Field(default_factory=list)


class TypeSpecificExtractionSchema(BaseModel):
    fields: list[ProvenanceField] = Field(default_factory=list)


FieldCategory = Literal[
    "universal",
    "contract_specific",
    "proposal_specific",
    "financial_report_specific",
    "policy_specific",
    "other_specific",
]


def type_specific_category(document_type: DocumentType) -> str:
    if document_type == DocumentType.OTHER:
        return "other_specific"
    return f"{document_type.value}_specific"


# Type-specific field names expected in prompts / rules extraction (OPEN QUESTION §26 for proposal/policy).
TYPE_SPECIFIC_FIELD_NAMES: dict[DocumentType, list[str]] = {
    DocumentType.CONTRACT: [
        "Obligations",
        "Termination Terms",
        "Termination Notice Period",
        "Penalties",
    ],
    DocumentType.FINANCIAL_REPORT: [
        "Revenue",
        "EBITDA",
        "Forecast Period",
        "Reporting Period",
        "Net Profit",
    ],
    DocumentType.PROPOSAL: [
        "Customer",
        "Offering",
        "Price",
    ],
    DocumentType.POLICY: [
        "Policy Scope",
        "Policy Owner",
        "Effective Date",
    ],
    DocumentType.OTHER: [],
}


UNIVERSAL_FIELD_NAMES = [
    "Title",
    "Parties",
    "Effective Date",
    "Key Dates",
    "Amounts",
    "Reference Numbers",
    "Topics",
]


def validate_provenance_fields(fields: list[ProvenanceField]) -> list[ProvenanceField]:
    """BR-302: reject fields missing provenance before persistence."""
    validated: list[ProvenanceField] = []
    for item in fields:
        if item.source_page < 1 or not item.field_value.strip():
            continue
        validated.append(item)
    return validated
