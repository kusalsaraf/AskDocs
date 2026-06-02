from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class ParsedElement:
    content: str
    element_type: str       # "Title", "NarrativeText", "Table", "ListItem", "Header", etc.
    page_number: int | None
    metadata: dict = field(default_factory=dict)


@dataclass
class ParsedDocument:
    elements: list[ParsedElement]
    metadata: dict = field(default_factory=dict)  # title, author, page_count, …


class ParserProvider(ABC):
    provider_name: str
    supported_file_types: set[str]
    supported_strategies: set[str]

    @abstractmethod
    def parse(
        self,
        file_bytes: bytes,
        file_type: str,
        strategy: str = "fast",
    ) -> ParsedDocument: ...
