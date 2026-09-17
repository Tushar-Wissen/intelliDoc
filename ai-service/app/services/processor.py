import re
from typing import List, Tuple
from app.schemas import QACitation, SentimentEnum, AnalyzeResponse, QAResponse


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
        current_page = None
        sentences = []
        for line in context.splitlines():
            page_match = re.fullmatch(r"\[Page (\d+)\]", line.strip())
            if page_match:
                current_page = int(page_match.group(1))
                continue
            sentences.extend((sentence.strip(), current_page) for sentence in re.split(r'(?<=[.!?])\s+', line) if sentence.strip())
        q_words = set(re.findall(r'\b\w+\b', question.lower())) - {"what", "is", "the", "how", "where", "who", "when", "why", "did", "was", "are", "a", "an", "of", "in"}

        best_sentence = None
        best_page = None
        best_overlap = 0

        for sentence, page_number in sentences:
            s_words = set(re.findall(r'\b\w+\b', sentence.lower()))
            overlap = len(q_words.intersection(s_words))
            if overlap > best_overlap:
                best_overlap = overlap
                best_sentence = sentence
                best_page = page_number

        if not best_sentence or best_overlap == 0:
            best_sentence = "Not found in supplied document context."
            confidence = 0.0
            is_not_found = True
            citations = []
        else:
            confidence = min(0.75 + (best_overlap * 0.08), 0.96)
            is_not_found = False
            citations = [QACitation(page_number=best_page, source_excerpt=best_sentence)]

        return QAResponse(
            document_id=doc_id,
            question=question,
            answer=best_sentence,
            confidence=round(confidence, 2),
            is_not_found=is_not_found,
            citations=citations,
        )
