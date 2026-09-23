from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ParsedPage:
    page_number: int
    raw_text: str
    headings: list[str] = field(default_factory=list)


@dataclass
class ParsedSection:
    heading: str
    start_page: int
    end_page: int
    parent_index: int | None = None
    level: int = 1
    body_text: str = ""


@dataclass
class ParsedDocument:
    pages: list[ParsedPage]
    sections: list[ParsedSection]
    file_type: str = "pdf"
