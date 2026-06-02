from __future__ import annotations

import io
import time

from apps.core.logging import get_logger
from apps.documents.exceptions import ParserProviderError, ParserStrategyUnavailable
from apps.documents.parsing.base import ParsedDocument, ParsedElement, ParserProvider

logger = get_logger(__name__)


class PypdfParserProvider(ParserProvider):
    provider_name = "pypdf"
    supported_file_types = {"pdf"}
    supported_strategies = {"fast"}

    def parse(
        self,
        file_bytes: bytes,
        file_type: str,
        strategy: str = "fast",
    ) -> ParsedDocument:
        if strategy != "fast":
            raise ParserStrategyUnavailable(
                strategy=strategy,
                message=f"pypdf provider only supports strategy='fast', got '{strategy}'.",
            )
        if file_type != "pdf":
            raise ParserStrategyUnavailable(
                strategy=strategy,
                message=f"pypdf provider only supports PDF files, got '{file_type}'.",
            )

        try:
            from pypdf import PdfReader
        except ImportError as exc:
            raise ParserProviderError("pypdf is not installed.") from exc

        start = time.monotonic()
        try:
            reader = PdfReader(io.BytesIO(file_bytes))
            elements: list[ParsedElement] = []
            for page_num, page in enumerate(reader.pages, start=1):
                text = (page.extract_text() or "").strip()
                if text:
                    elements.append(
                        ParsedElement(
                            content=text,
                            element_type="NarrativeText",
                            page_number=page_num,
                        )
                    )
        except Exception as exc:
            raise ParserProviderError(f"pypdf failed to parse PDF: {exc}") from exc

        duration_ms = int((time.monotonic() - start) * 1000)
        page_count = len(reader.pages)
        logger.info(
            "pypdf parse complete",
            extra={
                "strategy": "fast",
                "num_elements": len(elements),
                "page_count": page_count,
                "duration_ms": duration_ms,
            },
        )
        if not elements:
            logger.warning("pypdf returned 0 text elements — PDF may be image-only")

        return ParsedDocument(
            elements=elements,
            metadata={"page_count": page_count, "strategy_used": "fast"},
        )
