"""Split parsed document elements into token-bounded chunks for embedding."""

from __future__ import annotations

from dataclasses import dataclass

from apps.core.constants import (
    CHUNK_MAX_TOKENS,
    CHUNK_OVERLAP_TOKENS,
    TABLE_MAX_TOKENS,
    TIKTOKEN_ENCODING,
)
from apps.core.logging import get_logger
from apps.documents.parsing.base import ParsedElement

logger = get_logger(__name__)

_BOUNDARY_TYPES = {"Title", "Header"}
_TABLE_TYPE = "Table"
_SKIP_TYPES = {"PageBreak"}


@dataclass
class Chunk:
    content: str
    element_type: str
    page_number: int | None


def chunk_elements(elements: list[ParsedElement]) -> list[Chunk]:
    """Convert ParsedElements to Chunks respecting semantic boundaries.

    Rules:
    - Tables are kept whole (up to TABLE_MAX_TOKENS); oversized tables are token-split.
    - Title / Header elements flush pending prose and start a new semantic boundary.
    - NarrativeText and other prose types are concatenated and token-split at 512 tokens
      with 50-token overlap.
    """
    if not elements:
        return []

    import tiktoken
    enc = tiktoken.get_encoding(TIKTOKEN_ENCODING)

    chunks: list[Chunk] = []
    pending_texts: list[str] = []
    pending_page: int | None = None
    pending_type = "NarrativeText"

    def flush() -> None:
        nonlocal pending_texts, pending_page, pending_type
        if not pending_texts:
            return
        full_text = " ".join(pending_texts).strip()
        if full_text:
            _split_by_tokens(full_text, pending_type, pending_page, enc, chunks)
        pending_texts.clear()
        pending_page = None
        pending_type = "NarrativeText"

    for element in elements:
        etype = element.element_type

        if etype in _SKIP_TYPES:
            flush()
            continue

        if etype == _TABLE_TYPE:
            flush()
            tokens = enc.encode(element.content)
            if len(tokens) <= TABLE_MAX_TOKENS:
                chunks.append(
                    Chunk(
                        content=element.content,
                        element_type=_TABLE_TYPE,
                        page_number=element.page_number,
                    )
                )
            else:
                _split_by_tokens(element.content, _TABLE_TYPE, element.page_number, enc, chunks)
            continue

        if etype in _BOUNDARY_TYPES:
            flush()
            pending_texts = [element.content]
            pending_page = element.page_number
            pending_type = etype
            continue

        # Prose accumulation
        if pending_page is None:
            pending_page = element.page_number
        pending_texts.append(element.content)

    flush()
    logger.info("chunking complete", extra={"num_chunks": len(chunks)})
    return chunks


def _split_by_tokens(
    text: str,
    element_type: str,
    page_number: int | None,
    enc: object,
    chunks: list[Chunk],
) -> None:
    """Split text into token-bounded chunks with overlap."""
    tokens = enc.encode(text)
    if not tokens:
        return

    start = 0
    while start < len(tokens):
        end = min(start + CHUNK_MAX_TOKENS, len(tokens))
        chunk_tokens = tokens[start:end]
        chunk_text = enc.decode(chunk_tokens).strip()
        if chunk_text:
            chunks.append(
                Chunk(content=chunk_text, element_type=element_type, page_number=page_number)
            )
        if end >= len(tokens):
            break
        start = end - CHUNK_OVERLAP_TOKENS
