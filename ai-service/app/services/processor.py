import re
from typing import List, Tuple, Optional

from app.schemas import (
    QACitation,
    SentimentEnum,
    AnalyzeResponse,
    QAResponse,
    DocumentModule,
)


class DocumentProcessor:
    """
    Intelligent document processing and analysis engine.

    Responsibilities:
    - Generate document summary
    - Extract entities
    - Analyze sentiment
    - Extract key topics
    - Extract document modules / headings
    - Answer questions using document context
    """

    # ============================================================
    # SENTIMENT WORDS
    # ============================================================

    POSITIVE_WORDS = {
        "growth",
        "increase",
        "profit",
        "success",
        "innovative",
        "excellent",
        "improved",
        "positive",
        "strong",
        "outperform",
        "leading",
        "benefit",
        "efficient",
    }

    NEGATIVE_WORDS = {
        "decline",
        "loss",
        "risk",
        "failure",
        "delay",
        "negative",
        "poor",
        "drop",
        "decrease",
        "threat",
        "vulnerability",
        "deficit",
        "issue",
    }

    # ============================================================
    # SUMMARY
    # ============================================================

    @classmethod
    def generate_summary(
        cls,
        content: str,
        max_length: int = 150,
    ) -> str:
        """
        Extract key informative sentences as executive summary.
        """

        cleaned = (
            content.strip()
            if content
            else ""
        )

        if not cleaned:
            return "No text content available for analysis."

        sentences = [
            sentence.strip()
            for sentence in re.split(
                r"(?<=[.!?])\s+",
                cleaned,
            )
            if sentence.strip()
        ]

        if not sentences:
            return cleaned[:max_length]

        summary = " ".join(
            sentences[:2]
        )

        if len(summary) > max_length:

            shortened = (
                summary[:max_length]
                .rsplit(" ", 1)[0]
            )

            if shortened:
                summary = shortened + "..."
            else:
                summary = (
                    summary[:max_length]
                    + "..."
                )

        return summary

    # ============================================================
    # ENTITY EXTRACTION
    # ============================================================

    @classmethod
    def extract_entities(
        cls,
        text: str,
    ) -> List[str]:
        """
        Extract simple named entities such as:
        - Organizations
        - Technologies
        - Dates
        - Statistics
        """

        if not text:
            return []

        entities = set()

        # --------------------------------------------------------
        # Capitalized phrases
        # --------------------------------------------------------

        capitalized = re.findall(
            r"\b[A-Z][a-zA-Z0-9\-.']+"
            r"(?:\s+[A-Z][a-zA-Z0-9\-.']+)*\b",
            text,
        )

        ignored_entities = {
            "the",
            "and",
            "for",
            "with",
            "this",
            "that",
        }

        for item in capitalized:

            if (
                len(item) > 2
                and item.lower()
                not in ignored_entities
            ):
                entities.add(item)

        # --------------------------------------------------------
        # Financial / numeric entities
        # --------------------------------------------------------

        financials = re.findall(
            r"\b\$?\d+(?:\.\d+)?%?\s*"
            r"(?:billion|million|percent|revenue|margin|Q[1-4])?\b",
            text,
            re.IGNORECASE,
        )

        for item in financials:

            if item.strip():
                entities.add(
                    item.strip()
                )

        return sorted(
            list(entities)
        )[:8]

    # ============================================================
    # SENTIMENT
    # ============================================================

    @classmethod
    def analyze_sentiment(
        cls,
        text: str,
    ) -> Tuple[SentimentEnum, float]:
        """
        Analyze sentiment polarity and confidence score.
        """

        if not text:
            return (
                SentimentEnum.NEUTRAL,
                0.85,
            )

        words = re.findall(
            r"\b\w+\b",
            text.lower(),
        )

        pos_count = sum(
            1
            for word in words
            if word in cls.POSITIVE_WORDS
        )

        neg_count = sum(
            1
            for word in words
            if word in cls.NEGATIVE_WORDS
        )

        total_matches = (
            pos_count + neg_count
        )

        if total_matches == 0:
            return (
                SentimentEnum.NEUTRAL,
                0.85,
            )

        score = (
            (pos_count - neg_count)
            / float(total_matches)
        )

        confidence = min(
            0.70
            + (total_matches * 0.05),
            0.98,
        )

        if score > 0.15:
            return (
                SentimentEnum.POSITIVE,
                round(confidence, 2),
            )

        if score < -0.15:
            return (
                SentimentEnum.NEGATIVE,
                round(confidence, 2),
            )

        return (
            SentimentEnum.NEUTRAL,
            round(confidence, 2),
        )

    # ============================================================
    # KEY TOPICS
    # ============================================================

    @classmethod
    def extract_key_topics(
        cls,
        text: str,
    ) -> List[str]:
        """
        Extract domain topics and key themes.
        """

        if not text:
            return [
                "General Information",
                "Document Processing",
            ]

        topic_keywords = {

            "Financial Growth": [
                "revenue",
                "margin",
                "quarter",
                "fiscal",
                "profit",
                "earnings",
            ],

            "Microservices Architecture": [
                "microservices",
                "api",
                "spring boot",
                "fastapi",
                "react",
                "docker",
            ],

            "Cloud & Database": [
                "supabase",
                "postgres",
                "database",
                "cloud",
                "security",
            ],

            "AI & Intelligence": [
                "ai",
                "document",
                "summarization",
                "extraction",
                "nlp",
                "processing",
            ],

            "Operational Execution": [
                "strategy",
                "roadmap",
                "deployment",
                "pipeline",
                "ci/cd",
            ],
        }

        text_lower = text.lower()

        found_topics = []

        for topic, keywords in topic_keywords.items():

            if any(
                keyword in text_lower
                for keyword in keywords
            ):
                found_topics.append(topic)

        if not found_topics:
            found_topics = [
                "General Information",
                "Document Processing",
            ]

        return found_topics

    # ============================================================
    # MODULE EXTRACTION
    # ============================================================

    @classmethod
    def extract_modules(
        cls,
        text: str,
        blocks=None,
    ) -> List[DocumentModule]:
        """
        Extract document modules.

        Priority:

        1. Structured PPTX/PDF blocks
        2. Text-based fallback

        PPTX:
            SLIDE_TITLE blocks are used directly as modules.

        PDF:
            Visual heading detection is used.

        Text fallback:
            Numbered headings and likely headings are detected.
        """

        if blocks:

            structured_modules = (
                cls.extract_modules_from_blocks(
                    blocks
                )
            )

            if structured_modules:
                return structured_modules

        return cls.extract_modules_from_text(
            text
        )

    # ============================================================
    # STRUCTURED BLOCK EXTRACTION
    # ============================================================

    @classmethod
    def extract_modules_from_blocks(
        cls,
        blocks,
    ) -> List[DocumentModule]:
        """
        Extract modules from structured document blocks.

        PPTX behavior:

            SLIDE_TITLE
                -> Module

            SLIDE_CONTENT
                -> Not a module

        PDF behavior:

            PAGE
                -> Visual heading detection
        """

        if not blocks:
            return []

        # --------------------------------------------------------
        # PPTX
        #
        # The Java extractor marks actual slide titles as:
        # SLIDE_TITLE
        # --------------------------------------------------------

        slide_title_blocks = [
            block
            for block in blocks
            if getattr(
                block,
                "type",
                None
            ) == "SLIDE_TITLE"
        ]

        print("\n========== PPTX BLOCKS ==========")

        for block in blocks:
            print(
                "TYPE:",
                getattr(block, "type", None),
                "| PAGE:",
                getattr(block, "page_number", None),
                "| TEXT:",
                repr(getattr(block, "text", None)),
                "| FONT:",
                getattr(block, "font_size", None),
                "| BOLD:",
                getattr(block, "bold", None),
                "| X:",
                getattr(block, "x", None),
                "| Y:",
                getattr(block, "y", None),
            )

        print("========== END PPTX BLOCKS ==========\n")

        if slide_title_blocks:

            modules = []

            for block in slide_title_blocks:

                text = (
                    block.text
                    if block.text
                    else ""
                ).strip()

                if not text:
                    continue

                if cls.is_module_noise(
                    text
                ):
                    continue

                if cls.is_phone_number(
                    text
                ):
                    continue

                modules.append(
                    {
                        "module_number": "",
                        "module_name": text,
                        "children": [],
                    }
                )

            modules = (
                cls.remove_duplicate_modules(
                    modules
                )
            )

            return cls.build_module_hierarchy(
                modules
            )

        # --------------------------------------------------------
        # PDF / other structured documents
        # --------------------------------------------------------

        return cls.extract_modules_from_visual_blocks(
            blocks
        )

    # ============================================================
    # PDF VISUAL BLOCK EXTRACTION
    # ============================================================

    @classmethod
    def extract_modules_from_visual_blocks(
        cls,
        blocks,
    ) -> List[DocumentModule]:
        """
        Detect headings from PDF structured blocks.

        Uses:
        - Font size
        - Bold
        - Position
        - Text length
        - Capitalization
        """

        if not blocks:
            return []

        pages = {}

        # --------------------------------------------------------
        # Group blocks by page
        # --------------------------------------------------------

        for block in blocks:

            page_number = (
                block.page_number
                if block.page_number is not None
                else 0
            )

            pages.setdefault(
                page_number,
                []
            ).append(block)

        modules = []

        # --------------------------------------------------------
        # Process each page
        # --------------------------------------------------------

        for page_number in sorted(
            pages.keys()
        ):

            page_blocks = [
                block
                for block in pages[
                    page_number
                ]
                if block.text
                and block.text.strip()
            ]

            if not page_blocks:
                continue

            # ----------------------------------------------------
            # Find largest font
            # ----------------------------------------------------

            font_sizes = [
                block.font_size
                for block in page_blocks
                if (
                    block.font_size
                    is not None
                    and block.font_size > 0
                )
            ]

            max_font_size = (
                max(font_sizes)
                if font_sizes
                else 0
            )

            # ----------------------------------------------------
            # Sort top-to-bottom
            # ----------------------------------------------------

            page_blocks.sort(
                key=lambda block: (
                    block.y
                    if block.y is not None
                    else 0
                )
            )

            # ----------------------------------------------------
            # Evaluate blocks
            # ----------------------------------------------------

            for block in page_blocks:

                text = (
                    block.text
                    if block.text
                    else ""
                ).strip()

                if not text:
                    continue

                if cls.is_module_noise(
                    text
                ):
                    continue

                if cls.is_phone_number(
                    text
                ):
                    continue

                score = (
                    cls.calculate_module_score(
                        block,
                        max_font_size,
                    )
                )

                # Strong heading threshold
                if score < 7:
                    continue

                # ------------------------------------------------
                # Numbered heading
                # ------------------------------------------------

                numbered_match = re.match(
                    r"^\s*"
                    r"(\d+(?:\.\d+)*)"
                    r"[.)]?\s+"
                    r"(.+?)"
                    r"\s*$",
                    text,
                )

                if numbered_match:

                    module_number = (
                        numbered_match.group(1)
                    )

                    module_name = (
                        numbered_match.group(2)
                        .strip()
                    )

                else:

                    module_number = ""
                    module_name = text

                if not module_name:
                    continue

                modules.append(
                    {
                        "module_number":
                            module_number,

                        "module_name":
                            module_name,

                        "children": [],
                    }
                )

        modules = (
            cls.remove_duplicate_modules(
                modules
            )
        )

        return cls.build_module_hierarchy(
            modules
        )

    # ============================================================
    # MODULE SCORE
    # ============================================================

    @classmethod
    def calculate_module_score(
        cls,
        block,
        max_font_size: float,
    ) -> int:
        """
        Calculate heading score for structured
        PDF blocks.
        """

        text = (
            block.text
            if block.text
            else ""
        ).strip()

        if not text:
            return 0

        words = text.split()

        # --------------------------------------------------------
        # Reject long paragraph-like blocks
        # --------------------------------------------------------

        if len(words) > 12:
            return 0

        # --------------------------------------------------------
        # Reject obvious noise
        # --------------------------------------------------------

        if cls.is_module_noise(
            text
        ):
            return 0

        if cls.is_phone_number(
            text
        ):
            return 0

        score = 0

        # --------------------------------------------------------
        # Font size
        # --------------------------------------------------------

        if (
            block.font_size is not None
            and max_font_size > 0
        ):

            font_ratio = (
                block.font_size
                / max_font_size
            )

            if font_ratio >= 0.90:
                score += 5

            elif font_ratio >= 0.75:
                score += 4

            elif font_ratio >= 0.60:
                score += 2

        # --------------------------------------------------------
        # Bold
        # --------------------------------------------------------

        if block.bold:
            score += 3

        # --------------------------------------------------------
        # Short text
        # --------------------------------------------------------

        if len(words) <= 6:
            score += 2

        elif len(words) <= 10:
            score += 1

        # --------------------------------------------------------
        # Title capitalization
        # --------------------------------------------------------

        title_score = (
            cls.calculate_title_case_score(
                text
            )
        )

        if title_score >= 0.60:
            score += 2

        elif title_score >= 0.40:
            score += 1

        # --------------------------------------------------------
        # Question heading
        # --------------------------------------------------------

        if text.endswith("?"):
            score += 2

        # --------------------------------------------------------
        # Normal sentence penalty
        # --------------------------------------------------------

        if cls.looks_like_sentence(
            text
        ):
            score -= 4

        return score

    # ============================================================
    # SENTENCE DETECTION
    # ============================================================

    @classmethod
    def looks_like_sentence(
        cls,
        text: str,
    ) -> bool:
        """
        Determine whether text looks like normal
        paragraph content instead of a heading.
        """

        stripped = text.strip()

        if not stripped:
            return False

        # --------------------------------------------------------
        # Strong punctuation indication
        # --------------------------------------------------------

        if stripped.endswith(
            (".", "!", ";", ",")
        ):
            return True

        words = stripped.split()

        # --------------------------------------------------------
        # Long sentence containing common verbs
        # --------------------------------------------------------

        if (
            len(words) >= 8
            and re.search(
                r"\b("
                r"is|are|was|were|has|have|had|"
                r"will|would|can|could|should|"
                r"may|might|must"
                r")\b",
                stripped,
                re.IGNORECASE,
            )
        ):
            return True

        return False

    # ============================================================
    # PHONE NUMBER DETECTION
    # ============================================================

    @classmethod
    def is_phone_number(
        cls,
        text: str,
    ) -> bool:
        """
        Detect phone-number-like text.

        Examples:
            +91 9989339903
            (+91) (9989339903)
            99893-39903
        """

        if not text:
            return False

        normalized = text.strip()

        # Extract digits
        digits = re.sub(
            r"\D",
            "",
            normalized,
        )

        # Typical phone number length
        if not (
            8 <= len(digits) <= 15
        ):
            return False

        # Phone numbers generally consist only
        # of digits and formatting characters.
        if re.fullmatch(
            r"[\d\s()+\-./]+",
            normalized,
        ):
            return True

        return False

    # ============================================================
    # MODULE NOISE
    # ============================================================

    @classmethod
    def is_module_noise(
        cls,
        text: str,
    ) -> bool:
        """
        Detect text that should never become a module.
        """

        if not text:
            return True

        normalized = re.sub(
            r"\s+",
            " ",
            text.lower(),
        ).strip()

        if not normalized:
            return True

        # --------------------------------------------------------
        # Phone number
        # --------------------------------------------------------

        if cls.is_phone_number(
            text
        ):
            return True

        # --------------------------------------------------------
        # Footer
        # --------------------------------------------------------

        if re.search(
            r"knowledge\s*\.\s*insight\s*\.\s*action",
            normalized,
        ):
            return True

        # --------------------------------------------------------
        # Page / slide number
        # --------------------------------------------------------

        if re.fullmatch(
            r"(page|slide)?\s*\d+",
            normalized,
        ):
            return True

        # --------------------------------------------------------
        # URLs
        # --------------------------------------------------------

        if re.search(
            r"https?://|www\.",
            normalized,
        ):
            return True

        # --------------------------------------------------------
        # Email
        # --------------------------------------------------------

        if "@" in normalized:
            return True

        # --------------------------------------------------------
        # Common footer-like content
        # --------------------------------------------------------

        if normalized in {
            "confidential",
            "thank you",
            "thankyou",
            "contact us",
            "www",
        }:
            return True

        return False

    # ============================================================
    # TEXT-ONLY FALLBACK
    # ============================================================

    @classmethod
    def extract_modules_from_text(
        cls,
        text: str,
    ) -> List[DocumentModule]:
        """
        Extract modules from plain extracted text.
        """

        if not text:
            return []

        modules = []

        lines = text.splitlines()

        numbered_heading_pattern = re.compile(
            r"^\s*"
            r"(\d+(?:\.\d+)*)"
            r"[.)]?\s+"
            r"(.+?)"
            r"\s*$"
        )

        for index, raw_line in enumerate(
            lines
        ):

            line = raw_line.strip()

            if not line:
                continue

            # ----------------------------------------------------
            # Numbered heading
            # ----------------------------------------------------

            match = (
                numbered_heading_pattern.match(
                    line
                )
            )

            if match:

                module_number = (
                    match.group(1)
                )

                module_name = (
                    match.group(2)
                    .strip()
                )

                if (
                    module_name
                    and not cls.is_module_noise(
                        module_name
                    )
                ):

                    modules.append(
                        {
                            "module_number":
                                module_number,

                            "module_name":
                                module_name,

                            "children": [],
                        }
                    )

                continue

            # ----------------------------------------------------
            # Non-numbered heading
            # ----------------------------------------------------

            if cls.is_likely_text_heading(
                lines,
                index,
            ):

                if cls.is_module_noise(
                    line
                ):
                    continue

                if cls.is_phone_number(
                    line
                ):
                    continue

                modules.append(
                    {
                        "module_number": "",
                        "module_name": line,
                        "children": [],
                    }
                )

        modules = (
            cls.remove_duplicate_modules(
                modules
            )
        )

        return cls.build_module_hierarchy(
            modules
        )

    # ============================================================
    # TEXT HEADING DETECTION
    # ============================================================

    @classmethod
    def is_likely_text_heading(
        cls,
        lines: List[str],
        index: int,
    ) -> bool:

        line = lines[index].strip()

        if not line:
            return False

        # --------------------------------------------------------
        # Basic validation
        # --------------------------------------------------------

        if len(line) < 3:
            return False

        if len(line) > 100:
            return False

        words = line.split()

        if len(words) > 10:
            return False

        # --------------------------------------------------------
        # Noise
        # --------------------------------------------------------

        if cls.is_module_noise(
            line
        ):
            return False

        if cls.is_phone_number(
            line
        ):
            return False

        # --------------------------------------------------------
        # Normal sentence
        # --------------------------------------------------------

        if line.endswith(
            (".", ",", ";", "!")
        ):
            return False

        # --------------------------------------------------------
        # Bullets
        # --------------------------------------------------------

        if re.match(
            r"^[•●▪◦‣►▸■□○\-–—*]+\s*",
            line,
        ):
            return False

        # --------------------------------------------------------
        # Numbers
        # --------------------------------------------------------

        if re.fullmatch(
            r"\d+",
            line,
        ):
            return False

        score = 0

        # --------------------------------------------------------
        # Blank before
        # --------------------------------------------------------

        if index > 0:

            if not lines[
                index - 1
            ].strip():

                score += 2

        # --------------------------------------------------------
        # Blank after
        # --------------------------------------------------------

        if index < len(lines) - 1:

            if not lines[
                index + 1
            ].strip():

                score += 2

        # --------------------------------------------------------
        # Title capitalization
        # --------------------------------------------------------

        title_score = (
            cls.calculate_title_case_score(
                line
            )
        )

        if title_score >= 0.60:
            score += 3

        elif title_score >= 0.40:
            score += 2

        # --------------------------------------------------------
        # Short heading
        # --------------------------------------------------------

        if len(words) <= 6:
            score += 2

        # --------------------------------------------------------
        # Question heading
        # --------------------------------------------------------

        if line.endswith("?"):
            score += 2

        return score >= 5

    # ============================================================
    # TITLE CASE SCORE
    # ============================================================

    @classmethod
    def calculate_title_case_score(
        cls,
        line: str,
    ) -> float:

        words = line.split()

        if not words:
            return 0.0

        ignored_words = {
            "a",
            "an",
            "the",
            "and",
            "or",
            "but",
            "of",
            "in",
            "on",
            "to",
            "for",
            "with",
            "by",
            "from",
            "is",
            "are",
            "was",
            "were",
        }

        meaningful_words = []

        for word in words:

            cleaned_word = re.sub(
                r"[^A-Za-z0-9]",
                "",
                word,
            )

            if not cleaned_word:
                continue

            if (
                cleaned_word.lower()
                in ignored_words
            ):
                continue

            meaningful_words.append(
                cleaned_word
            )

        if not meaningful_words:
            return 0.0

        title_like_words = sum(
            1
            for word in meaningful_words
            if (
                word[0].isupper()
                or word.isupper()
            )
        )

        return (
            title_like_words
            / len(meaningful_words)
        )

    # ============================================================
    # REMOVE DUPLICATES
    # ============================================================

    @classmethod
    def remove_duplicate_modules(
        cls,
        modules: List[dict],
    ) -> List[dict]:

        result = []

        seen = set()

        for module in modules:

            number = module[
                "module_number"
            ]

            name = re.sub(
                r"\s+",
                " ",
                module[
                    "module_name"
                ].lower(),
            ).strip()

            key = (
                number,
                name,
            )

            if key in seen:
                continue

            seen.add(key)

            result.append(
                module
            )

        return result

    # ============================================================
    # BUILD MODULE HIERARCHY
    # ============================================================

    @classmethod
    def build_module_hierarchy(
        cls,
        modules: List[dict],
    ) -> List[DocumentModule]:

        root_modules = []

        for module in modules:

            current_module = (
                DocumentModule(
                    module_number=(
                        module[
                            "module_number"
                        ]
                    ),
                    module_name=(
                        module[
                            "module_name"
                        ]
                    ),
                    children=[],
                )
            )

            number = module[
                "module_number"
            ]

            # ----------------------------------------------------
            # Non-numbered module
            # ----------------------------------------------------

            if not number:

                root_modules.append(
                    current_module
                )

                continue

            # ----------------------------------------------------
            # Root number
            #
            # 1
            # 2
            # 3
            # ----------------------------------------------------

            if "." not in number:

                root_modules.append(
                    current_module
                )

            else:

                parent_number = (
                    number.rsplit(
                        ".",
                        1,
                    )[0]
                )

                parent = cls.find_module(
                    root_modules,
                    parent_number,
                )

                if parent:

                    parent.children.append(
                        current_module
                    )

                else:

                    # Parent not found.
                    # Keep as root.
                    root_modules.append(
                        current_module
                    )

        return root_modules

    # ============================================================
    # FIND MODULE
    # ============================================================

    @classmethod
    def find_module(
        cls,
        modules: List[DocumentModule],
        number: str,
    ) -> Optional[DocumentModule]:

        for module in modules:

            if (
                module.module_number
                == number
            ):
                return module

            found = cls.find_module(
                module.children,
                number,
            )

            if found:
                return found

        return None

    # ============================================================
    # FULL DOCUMENT ANALYSIS
    # ============================================================

    @classmethod
    def process_document(
        cls,
        doc_id: str,
        title: str,
        content: str,
        max_summary_length: int = 150,
        blocks=None,
    ) -> AnalyzeResponse:

        # --------------------------------------------------------
        # Summary
        # --------------------------------------------------------

        summary = (
            cls.generate_summary(
                content,
                max_summary_length,
            )
        )

        # --------------------------------------------------------
        # Entities
        # --------------------------------------------------------

        entities = (
            cls.extract_entities(
                content
            )
        )

        # --------------------------------------------------------
        # Sentiment
        # --------------------------------------------------------

        sentiment, confidence = (
            cls.analyze_sentiment(
                content
            )
        )

        # --------------------------------------------------------
        # Topics
        # --------------------------------------------------------

        key_topics = (
            cls.extract_key_topics(
                content
            )
        )

        # --------------------------------------------------------
        # Modules
        # --------------------------------------------------------

        modules = cls.extract_modules(
            content,
            blocks,
        )

        # --------------------------------------------------------
        # Response
        # --------------------------------------------------------

        return AnalyzeResponse(
            document_id=doc_id,
            summary=summary,
            entities=entities,
            sentiment=sentiment,
            confidence_score=confidence,
            key_topics=key_topics,
            modules=modules,
        )

    # ============================================================
    # QUESTION ANSWERING
    # ============================================================

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
