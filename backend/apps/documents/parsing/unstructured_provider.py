from __future__ import annotations

import io
import time
from typing import Any

from apps.core.logging import get_logger
from apps.documents.exceptions import ParserProviderError, ParserStrategyUnavailable
from apps.documents.parsing.base import ParsedDocument, ParsedElement, ParserProvider

logger = get_logger(__name__)


def _check_hi_res_deps() -> None:
    """Raise ParserStrategyUnavailable if local-inference extras are not installed."""
    try:
        import unstructured_inference  # noqa: F401
    except (ImportError, ModuleNotFoundError) as exc:
        raise ParserStrategyUnavailable(
            strategy="hi_res",
            message=(
                "hi_res strategy requires the local-inference extras "
                "(pip install 'unstructured[local-inference]'). "
                "This pulls in detectron2 + PyTorch (~2GB). "
                "On an 8GB Mac with Docker capped at 3GB this will likely OOM. "
                "Use strategy='fast' instead."
            ),
        ) from exc


class UnstructuredParserProvider(ParserProvider):
    provider_name = "unstructured"
    supported_file_types = {"pdf", "docx", "txt"}
    supported_strategies = {"fast", "hi_res", "auto"}

    def parse(
        self,
        file_bytes: bytes,
        file_type: str,
        strategy: str = "fast",
    ) -> ParsedDocument:
        if strategy == "ocr_only":
            raise NotImplementedError(
                "ocr_only strategy is not implemented. Use fast, hi_res, or auto."
            )
        if strategy not in self.supported_strategies:
            raise ParserStrategyUnavailable(strategy)

        if strategy == "hi_res":
            _check_hi_res_deps()

        try:
            from unstructured.partition.auto import partition
        except ImportError as exc:
            raise ParserProviderError(
                "unstructured is not installed. Add unstructured[pdf] to requirements."
            ) from exc

        start = time.monotonic()
        try:
            file_obj = io.BytesIO(file_bytes)
            elements: list[Any] = partition(
                file=file_obj,
                content_type=_mime_for(file_type),
                strategy=strategy,
                include_page_breaks=True,
            )
        except (ImportError, ModuleNotFoundError) as exc:
            raise ParserStrategyUnavailable(
                strategy=strategy,
                message=(
                    f"Strategy '{strategy}' failed to load required dependencies: {exc}. "
                    "Try strategy='fast'."
                ),
            ) from exc
        except Exception as exc:
            raise ParserProviderError(f"unstructured partition failed: {exc}") from exc

        duration_ms = int((time.monotonic() - start) * 1000)
        parsed_elements = [_to_parsed_element(el) for el in elements]

        page_count = max(
            (e.page_number for e in parsed_elements if e.page_number),
            default=0,
        )
        logger.info(
            "unstructured parse complete",
            extra={
                "file_type": file_type,
                "strategy": strategy,
                "num_elements": len(parsed_elements),
                "page_count": page_count,
                "duration_ms": duration_ms,
            },
        )
        if not parsed_elements:
            logger.warning(
                "unstructured returned 0 elements — possible parse failure",
                extra={"file_type": file_type, "strategy": strategy},
            )

        return ParsedDocument(
            elements=parsed_elements,
            metadata={"page_count": page_count, "strategy_used": strategy},
        )


def _to_parsed_element(element: Any) -> ParsedElement:
    element_type = type(element).__name__  # "Title", "NarrativeText", "Table", etc.
    metadata = getattr(element, "metadata", None)
    page_number: int | None = getattr(metadata, "page_number", None) if metadata else None

    if element_type == "Table":
        text_as_html = getattr(metadata, "text_as_html", None) if metadata else None
        content = text_as_html or str(element)
    else:
        content = str(element)

    extra: dict = {}
    if metadata and hasattr(metadata, "filename"):
        extra["source_filename"] = metadata.filename

    return ParsedElement(
        content=content,
        element_type=element_type,
        page_number=page_number,
        metadata=extra,
    )


def _mime_for(file_type: str) -> str:
    return {
        "pdf": "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "txt": "text/plain",
    }.get(file_type, "application/octet-stream")
