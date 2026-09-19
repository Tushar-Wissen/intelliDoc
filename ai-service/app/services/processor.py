import json
import re
from typing import Dict, List, Optional, Tuple
from app.schemas import (
    AnalyzeResponse,
    DocumentChunk,
    DocumentTypeEnum,
    ExtractedField,
    ExtractionResponse,
    QAResponse,
    SentimentEnum,
)
from app.services.llm_wrapper import OpenAIWrapper

DEFAULT_DOCUMENT_TYPE_REGISTRY: Dict[str, Tuple[str, ...]] = {
    DocumentTypeEnum.CONTRACT.value: ("agreement", "contract", "termination", "parties", "effective date"),
    DocumentTypeEnum.PROPOSAL.value: ("proposal", "scope of work", "deliverables", "pricing", "solution"),
    DocumentTypeEnum.FINANCIAL_REPORT.value: ("revenue", "ebitda", "balance sheet", "fiscal", "forecast"),
    DocumentTypeEnum.POLICY.value: ("policy", "must comply", "prohibited", "procedure", "guideline"),
}


class DocumentProcessor:
    """Intelligent document processing and analysis engine."""

    POSITIVE_WORDS = {
        "growth", "increase", "profit", "success", "innovative", "excellent",
        "improved", "positive", "strong", "outperform", "leading", "benefit", "efficient"
    }
    NEGATIVE_WORDS = {
        "decline", "loss", "risk", "failure", "delay", "negative", "poor",
        "drop", "decrease", "threat", "vulnerability", "deficit", "issue"
    }

    CLASSIFICATION_RULES = {
        key: tuple(value)
        for key, value in DEFAULT_DOCUMENT_TYPE_REGISTRY.items()
    }
    LLM_CLASSIFIER = OpenAIWrapper()

    @classmethod
    def register_document_type(cls, document_type: str, keywords: List[str]) -> None:
        """Add a new document type at runtime without touching core classifier logic."""
        normalized = document_type.strip().lower()
        if not normalized:
            raise ValueError("document_type cannot be empty")
        cls.CLASSIFICATION_RULES[normalized] = tuple(keyword.lower() for keyword in keywords if keyword and keyword.strip())

    @classmethod
    def register_document_types(cls, document_types: dict) -> None:
        """Bulk register multiple document types."""
        for document_type, keywords in document_types.items():
            cls.register_document_type(document_type, list(keywords))

    @classmethod
    def load_default_registry(cls) -> None:
        """Reset the classifier to the default built-in registry."""
        cls.CLASSIFICATION_RULES = {
            key: tuple(value)
            for key, value in DEFAULT_DOCUMENT_TYPE_REGISTRY.items()
        }

    @classmethod
    def get_registered_document_types(cls) -> List[str]:
        """Return the currently registered document types in a stable order."""
        return list(cls.CLASSIFICATION_RULES.keys())

    @classmethod
    def _fallback_unknown_document(cls, searchable: str) -> Tuple[str, float]:
        """Return a conservative review-required result for low-confidence or unknown docs."""
        return DocumentTypeEnum.OTHER.value, 0.40

    @classmethod
    def _llm_fallback(cls, title: Optional[str], content: str) -> Optional[Tuple[str, float]]:
        """Classify with AI and allow document types outside the local registry."""
        if not cls.LLM_CLASSIFIER.enabled:
            return None
        try:
            result = cls.LLM_CLASSIFIER.classify_document(
                content=f"{title or ''}\n{content}",
                document_types=cls.get_registered_document_types(),
            )
            if not result:
                return None
            document_type = str(result["document_type"]).strip().lower().replace(" ", "_")
            if not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", document_type):
                return None
            return document_type, result["confidence"]
        except (ValueError, TypeError, KeyError, json.JSONDecodeError):
            return None

    @classmethod
    def generate_summary(cls, content: str, max_length: int = 150) -> str:
        """Extract key informative sentences as executive summary."""
        cleaned = content.strip()
        if not cleaned:
            return "No text content available for analysis."

        sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', cleaned) if s.strip()]
        if not sentences:
            return cleaned[:max_length]

        # Take first two key sentences or up to max_length
        summary = " ".join(sentences[:2])
        if len(summary) > max_length:
            summary = summary[:max_length].rsplit(' ', 1)[0] + "..."
        return summary

    @classmethod
    def extract_entities(cls, text: str) -> List[str]:
        """Extract Named Entities such as organizations, dates, statistics, and technologies."""
        entities = set()
        
        # Proper nouns and capitalized sequences
        capitalized = re.findall(r'\b[A-Z][a-zA-Z0-9\-\.\']+(?:\s+[A-Z][a-zA-Z0-9\-\.\']+)*\b', text)
        for item in capitalized:
            if len(item) > 2 and item.lower() not in {"the", "and", "for", "with", "this", "that"}:
                entities.add(item)

        # Percentages and Financial Metrics
        financials = re.findall(r'\b\$?\d+(?:\.\d+)?%?\s*(?:billion|million|percent|revenue|margin|Q[1-4])?\b', text, re.IGNORECASE)
        for item in financials:
            if item.strip():
                entities.add(item.strip())

        return sorted(list(entities))[:8]

    @classmethod
    def analyze_sentiment(cls, text: str) -> Tuple[SentimentEnum, float]:
        """Analyze sentiment polarity and confidence score."""
        words = re.findall(r'\b\w+\b', text.lower())
        pos_count = sum(1 for w in words if w in cls.POSITIVE_WORDS)
        neg_count = sum(1 for w in words if w in cls.NEGATIVE_WORDS)

        total_matches = pos_count + neg_count
        if total_matches == 0:
            return SentimentEnum.NEUTRAL, 0.85

        score = (pos_count - neg_count) / float(total_matches)
        confidence = min(0.70 + (total_matches * 0.05), 0.98)

        if score > 0.15:
            return SentimentEnum.POSITIVE, round(confidence, 2)
        elif score < -0.15:
            return SentimentEnum.NEGATIVE, round(confidence, 2)
        else:
            return SentimentEnum.NEUTRAL, round(confidence, 2)

    @classmethod
    def extract_key_topics(cls, text: str) -> List[str]:
        """Extract domain topics and key themes."""
        topic_keywords = {
            "Financial Growth": ["revenue", "margin", "quarter", "fiscal", "profit", "earnings"],
            "Microservices Architecture": ["microservices", "api", "spring boot", "fastapi", "react", "docker"],
            "Cloud & Database": ["supabase", "postgres", "database", "cloud", "security"],
            "AI & Intelligence": ["ai", "document", "summarization", "extraction", "nlp", "processing"],
            "Operational Execution": ["strategy", "roadmap", "deployment", "pipeline", "ci/cd"]
        }

        text_lower = text.lower()
        found_topics = []
        for topic, keywords in topic_keywords.items():
            if any(kw in text_lower for kw in keywords):
                found_topics.append(topic)

        if not found_topics:
            found_topics = ["General Information", "Document Processing"]
        return found_topics

    @classmethod
    def classify_document(cls, title: Optional[str], content: str) -> Tuple[str, float]:
        searchable = f"{title or ''} {content}".lower()

        llm_result = cls._llm_fallback(title, content)
        if llm_result:
            return llm_result

        scores = {
            str(document_type): sum(keyword in searchable for keyword in keywords)
            for document_type, keywords in cls.CLASSIFICATION_RULES.items()
        }
        document_type, matched = max(scores.items(), key=lambda item: item[1])
        if matched == 0:
            return cls._fallback_unknown_document(searchable)

        if (
            document_type == DocumentTypeEnum.CONTRACT.value
            and "agreement" in searchable
            and ("effective date" in searchable or "termination" in searchable)
        ):
            return document_type, 0.93

        confidence = {1: 0.58, 2: 0.72, 3: 0.84, 4: 0.90, 5: 0.93}.get(matched, 0.95)
        if confidence < 0.5:
            return cls._fallback_unknown_document(searchable)
        return document_type, confidence

    @staticmethod
    def _chunks(content: str, chunks: List[DocumentChunk]) -> List[DocumentChunk]:
        return chunks or [DocumentChunk(chunk_id="chunk-1", page=1, text=content)]

    @classmethod
    def _source_for_value(cls, value: str, chunks: List[DocumentChunk]) -> DocumentChunk:
        value_lower = value.lower()
        return next((chunk for chunk in chunks if value_lower in chunk.text.lower()), chunks[0])

    @classmethod
    def _field(
        cls,
        name: str,
        value: str,
        confidence: float,
        chunks: List[DocumentChunk],
    ) -> ExtractedField:
        source = cls._source_for_value(value, chunks)
        return ExtractedField(
            field_name=name,
            field_value=value,
            source_page=source.page,
            source_chunk_id=source.chunk_id,
            confidence=confidence,
        )

    @classmethod
    def extract_fields(
        cls,
        title: Optional[str],
        content: str,
        document_type: DocumentTypeEnum,
        chunks: List[DocumentChunk],
    ) -> List[ExtractedField]:
        normalized_type = document_type.value if isinstance(document_type, DocumentTypeEnum) else str(document_type)
        source_chunks = cls._chunks(content, chunks)
        fields: List[ExtractedField] = []
        if title:
            fields.append(cls._field("Title", title, 0.99, source_chunks))

        effective_date = re.search(
            r"(?:effective date|effective as of|commencement date)\s*[:\-]?\s*(\d{4}-\d{2}-\d{2})",
            content,
            re.IGNORECASE,
        )
        if effective_date:
            fields.append(cls._field("Effective Date", effective_date.group(1), 0.97, source_chunks))

        parties = re.search(
            r"between\s+(.+?)\s+and\s+(.+?)(?:\s*[,.;]|\s+(?:effective|dated|entered))",
            content,
            re.IGNORECASE,
        )
        if parties:
            fields.append(cls._field("Parties", f"{parties.group(1).strip()}, {parties.group(2).strip()}", 0.93, source_chunks))

        reference = re.search(r"(?:reference|ref(?:erence)?\s*(?:no|number)|document\s*id)\s*[:#-]?\s*([A-Z0-9][A-Z0-9./-]+)", content, re.IGNORECASE)
        if reference:
            fields.append(cls._field("Reference Number", reference.group(1), 0.90, source_chunks))

        amount = re.search(r"(?:\$|€|£|INR\s*)[\d,]+(?:\.\d{2})?(?:\s*(?:million|billion|lakh|crore))?", content, re.IGNORECASE)
        if amount:
            fields.append(cls._field("Amount", amount.group(0), 0.91, source_chunks))

        for topic in cls.extract_key_topics(content):
            fields.append(cls._field("Topic", topic, 0.78, source_chunks))

        if normalized_type == DocumentTypeEnum.CONTRACT.value:
            termination = re.search(r"([^.!?]*(?:termination|terminate)[^.!?]*[.!?]?)", content, re.IGNORECASE)
            if termination:
                fields.append(cls._field("Termination Terms", termination.group(1).strip(), 0.88, source_chunks))
            obligation = re.search(r"([^.!?]*(?:shall|must|required to)[^.!?]*[.!?]?)", content, re.IGNORECASE)
            if obligation:
                fields.append(cls._field("Obligations", obligation.group(1).strip(), 0.84, source_chunks))
        elif normalized_type == DocumentTypeEnum.FINANCIAL_REPORT.value:
            revenue = re.search(r"(?:revenue)\s*(?:was|of|:)?\s*([^,.;]+)", content, re.IGNORECASE)
            if revenue:
                fields.append(cls._field("Revenue", revenue.group(1).strip(), 0.92, source_chunks))
            ebitda = re.search(r"(?:EBITDA)\s*(?:was|of|:)?\s*([^,.;]+)", content, re.IGNORECASE)
            if ebitda:
                fields.append(cls._field("EBITDA", ebitda.group(1).strip(), 0.90, source_chunks))
            forecast = re.search(r"forecast(?: period)?\s*(?:for|:)?\s*([^,.;]+)", content, re.IGNORECASE)
            if forecast:
                fields.append(cls._field("Forecast Period", forecast.group(1).strip(), 0.87, source_chunks))

        return fields

    @classmethod
    def extract_document(cls, doc_id: str, title: Optional[str], content: str, chunks: List[DocumentChunk]) -> ExtractionResponse:
        document_type, classification_confidence = cls.classify_document(title, content)
        return ExtractionResponse(
            document_id=doc_id,
            document_type=document_type,
            classification_confidence=classification_confidence,
            review_required=classification_confidence < 0.5,
            fields=cls.extract_fields(title, content, document_type, chunks),
        )

    @classmethod
    def process_document(cls, doc_id: str, title: str, content: str, max_summary_length: int = 150) -> AnalyzeResponse:
        """Run full document analysis pipeline."""
        summary = cls.generate_summary(content, max_summary_length)
        entities = cls.extract_entities(content)
        sentiment, confidence = cls.analyze_sentiment(content)
        key_topics = cls.extract_key_topics(content)

        return AnalyzeResponse(
            document_id=doc_id,
            summary=summary,
            entities=entities,
            sentiment=sentiment,
            key_topics=key_topics,
            confidence_score=confidence
        )

    @classmethod
    def answer_question(cls, doc_id: str, context: str, question: str) -> QAResponse:
        """Extract answer snippet from context matching the user's question."""
        sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', context) if s.strip()]
        q_words = set(re.findall(r'\b\w+\b', question.lower())) - {"what", "is", "the", "how", "where", "who", "when", "why", "did", "was", "are", "a", "an", "of", "in"}

        best_sentence = None
        best_overlap = 0

        for sentence in sentences:
            s_words = set(re.findall(r'\b\w+\b', sentence.lower()))
            overlap = len(q_words.intersection(s_words))
            if overlap > best_overlap:
                best_overlap = overlap
                best_sentence = sentence

        if not best_sentence or best_overlap == 0:
            if sentences:
                best_sentence = f"Based on document context: {sentences[0]}"
                confidence = 0.70
            else:
                best_sentence = "No matching information found in document context."
                confidence = 0.50
        else:
            confidence = min(0.75 + (best_overlap * 0.08), 0.96)

        return QAResponse(
            document_id=doc_id,
            question=question,
            answer=best_sentence,
            confidence=round(confidence, 2)
        )
