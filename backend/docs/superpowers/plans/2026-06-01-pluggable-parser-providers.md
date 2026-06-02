# Pluggable Parser Providers (Unstructured.io) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pluggable document parser layer backed by unstructured.io (default) and pypdf (fallback), with fast/hi_res strategy as a config knob, producing semantically-typed chunks that flow into the existing embedding + retrieval pipeline.

**Architecture:** Mirrors the existing EmbeddingProvider and LLMProvider patterns — a `ParserProvider` ABC with `parse(bytes, file_type, strategy) → ParsedDocument`, a factory that reads `PARSER_PROVIDER` from settings, and a `DocumentChunk.parser_element_type` field that records element structure (Title, NarrativeText, Table, etc.) from the parser. The ingestion Celery task wires parse → chunk → embed → persist.

**Tech Stack:** unstructured[pdf]==0.14.4, pypdf==4.2.0, python-docx==1.1.2, tiktoken (bundled with openai), poppler-utils + libmagic1 system deps.

---

## File Map

### New files
| Path | Responsibility |
|------|---------------|
| `apps/documents/exceptions.py` | `ParserStrategyUnavailable`, `ParserProviderError`, `UnsupportedFileType` |
| `apps/documents/parsing/__init__.py` | Package marker |
| `apps/documents/parsing/base.py` | `ParsedElement`, `ParsedDocument`, `ParserProvider` ABC |
| `apps/documents/parsing/unstructured_provider.py` | Unstructured.io, fast/hi_res/auto strategies |
| `apps/documents/parsing/pypdf_provider.py` | pypdf fallback, fast only |
| `apps/documents/parsing/simple_provider.py` | python-docx + txt fallback |
| `apps/documents/parsing/factory.py` | `get_parser_provider()`, `get_parser_for_file_type()` |
| `apps/documents/chunking.py` | Element-aware chunker (512 tokens, 50 overlap) |
| `apps/documents/tasks.py` | `ingest_document` Celery task |
| `apps/documents/migrations/0002_document_parser_fields.py` | `parser_strategy` + `parser_element_type` |
| `apps/documents/test_migrations/0002_document_parser_fields.py` | SQLite-compatible version |
| `tests/fixtures/test.txt` | 3-paragraph plain text fixture |
| `tests/fixtures/test.pdf` | Minimal valid PDF fixture |
| `tests/test_unstructured_parser.py` | UnstructuredParserProvider unit tests |
| `tests/test_pypdf_parser.py` | PypdfParserProvider unit tests |
| `tests/test_parser_factory.py` | Factory + registry tests |
| `tests/test_chunking_with_elements.py` | Element-aware chunker tests |
| `docs/parsers.md` | Human-readable parser guide |

### Modified files
| Path | Change |
|------|--------|
| `requirements.txt` | Add unstructured[pdf], pypdf, python-docx |
| `Dockerfile` | Add poppler-utils, libmagic1 apt packages |
| `apps/documents/models.py` | Add `parser_strategy` to Document, `parser_element_type` to DocumentChunk |
| `config/settings/base.py` | Add `PARSER_PROVIDER`, `UNSTRUCTURED_DEFAULT_STRATEGY` |
| `.env` + `.env.example` | Add parser env vars |

---

## Task 1: Infrastructure — requirements + Dockerfile

**Files:** `requirements.txt`, `Dockerfile`

- [ ] Add to `requirements.txt` before the openai line:
```
# Document parsing
# unstructured: fast PDF parsing only. For hi_res mode, install the [local-inference]
# extras which pulls in detectron2 + PyTorch (~2GB additional). See docs/parsers.md.
unstructured[pdf]==0.14.4
pypdf==4.2.0
python-docx==1.1.2
```

- [ ] Update `Dockerfile` apt-get block to include poppler-utils + libmagic1:
```dockerfile
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    poppler-utils \
    libmagic1 \
    && rm -rf /var/lib/apt/lists/*
```

---

## Task 2: Custom exceptions

**Files:** Create `apps/documents/exceptions.py`

- [ ] Create the file:
```python
from __future__ import annotations


class ParserStrategyUnavailable(Exception):
    """Raised when the requested parsing strategy cannot run in this environment."""
    def __init__(self, strategy: str, message: str | None = None) -> None:
        self.strategy = strategy
        default = (
            f"Strategy '{strategy}' is not available. "
            "For hi_res mode, install unstructured[local-inference] "
            "(adds detectron2 + PyTorch, ~2GB). "
            "Falling back to strategy='fast' is recommended on constrained hardware."
        )
        super().__init__(message or default)


class ParserProviderError(Exception):
    """Wraps unexpected lower-level parser failures."""


class UnsupportedFileType(Exception):
    """Raised when no parser supports the requested file type."""
    def __init__(self, file_type: str) -> None:
        super().__init__(f"No parser supports file type: '{file_type}'")
```

---

## Task 3: Parser base abstractions

**Files:** Create `apps/documents/parsing/__init__.py`, `apps/documents/parsing/base.py`

- [ ] Create `__init__.py` (empty).

- [ ] Create `base.py`:
```python
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
```

---

## Task 4: UnstructuredParserProvider

**Files:** Create `apps/documents/parsing/unstructured_provider.py`

- [ ] Create the file:
```python
from __future__ import annotations

import io
import time
from typing import Any

from apps.core.logging import get_logger
from apps.documents.exceptions import ParserProviderError, ParserStrategyUnavailable
from apps.documents.parsing.base import ParsedDocument, ParsedElement, ParserProvider

logger = get_logger(__name__)


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

        try:
            from unstructured.partition.auto import partition
        except ImportError as exc:
            raise ParserProviderError(
                "unstructured is not installed. Add unstructured[pdf] to requirements."
            ) from exc

        if strategy == "hi_res":
            try:
                import unstructured.partition.pdf  # noqa: F401 — checks local-inference deps
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
    metadata = element.metadata if hasattr(element, "metadata") else {}
    page_number: int | None = getattr(metadata, "page_number", None)

    if element_type == "Table":
        content = getattr(metadata, "text_as_html", None) or str(element)
    else:
        content = str(element)

    extra: dict = {}
    if hasattr(metadata, "filename"):
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
```

---

## Task 5: PypdfParserProvider

**Files:** Create `apps/documents/parsing/pypdf_provider.py`

- [ ] Create the file:
```python
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
                text = page.extract_text() or ""
                text = text.strip()
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
```

---

## Task 6: SimpleParserProvider

**Files:** Create `apps/documents/parsing/simple_provider.py`

- [ ] Create the file:
```python
from __future__ import annotations

import time

from apps.core.logging import get_logger
from apps.documents.exceptions import ParserProviderError, UnsupportedFileType
from apps.documents.parsing.base import ParsedDocument, ParsedElement, ParserProvider

logger = get_logger(__name__)


class SimpleParserProvider(ParserProvider):
    """Lightweight DOCX + TXT parser — used as fallback when unstructured isn't active."""
    provider_name = "simple"
    supported_file_types = {"docx", "txt"}
    supported_strategies = {"fast"}

    def parse(
        self,
        file_bytes: bytes,
        file_type: str,
        strategy: str = "fast",
    ) -> ParsedDocument:
        if file_type == "txt":
            return self._parse_txt(file_bytes)
        if file_type == "docx":
            return self._parse_docx(file_bytes)
        raise UnsupportedFileType(file_type)

    def _parse_txt(self, file_bytes: bytes) -> ParsedDocument:
        start = time.monotonic()
        try:
            text = file_bytes.decode("utf-8", errors="replace").strip()
        except Exception as exc:
            raise ParserProviderError(f"Failed to decode TXT: {exc}") from exc

        duration_ms = int((time.monotonic() - start) * 1000)
        elements = [ParsedElement(content=text, element_type="NarrativeText", page_number=1)] if text else []
        logger.info("simple txt parse complete", extra={"num_elements": len(elements), "duration_ms": duration_ms})
        return ParsedDocument(elements=elements, metadata={"page_count": 1})

    def _parse_docx(self, file_bytes: bytes) -> ParsedDocument:
        import io
        import time

        try:
            from docx import Document as DocxDocument
        except ImportError as exc:
            raise ParserProviderError("python-docx is not installed.") from exc

        start = time.monotonic()
        try:
            doc = DocxDocument(io.BytesIO(file_bytes))
            elements: list[ParsedElement] = []
            for para in doc.paragraphs:
                text = para.text.strip()
                if not text:
                    continue
                style = para.style.name if para.style else ""
                if "Heading" in style or "Title" in style:
                    element_type = "Title"
                elif "List" in style:
                    element_type = "ListItem"
                else:
                    element_type = "NarrativeText"
                elements.append(ParsedElement(content=text, element_type=element_type, page_number=None))
        except Exception as exc:
            raise ParserProviderError(f"python-docx failed: {exc}") from exc

        duration_ms = int((time.monotonic() - start) * 1000)
        logger.info("simple docx parse complete", extra={"num_elements": len(elements), "duration_ms": duration_ms})
        return ParsedDocument(elements=elements, metadata={"page_count": None})
```

---

## Task 7: Factory + registry

**Files:** Create `apps/documents/parsing/factory.py`

- [ ] Create the file:
```python
from __future__ import annotations

from django.conf import settings

from apps.documents.exceptions import UnsupportedFileType
from apps.documents.parsing.base import ParserProvider
from apps.documents.parsing.pypdf_provider import PypdfParserProvider
from apps.documents.parsing.unstructured_provider import UnstructuredParserProvider

PARSER_PROVIDER_REGISTRY: dict[str, type[ParserProvider]] = {
    "unstructured": UnstructuredParserProvider,
    "pypdf": PypdfParserProvider,
}

_SUPPORTED_FILE_TYPES = {"pdf", "docx", "txt"}


def get_parser_provider() -> ParserProvider:
    """Returns the active parser provider based on PARSER_PROVIDER setting (default: unstructured)."""
    name = getattr(settings, "PARSER_PROVIDER", "unstructured")
    cls = PARSER_PROVIDER_REGISTRY.get(name)
    if cls is None:
        valid = ", ".join(PARSER_PROVIDER_REGISTRY)
        raise ValueError(f"Unknown PARSER_PROVIDER: '{name}'. Valid values: {valid}")
    return cls()


def get_parser_for_file_type(file_type: str) -> ParserProvider:
    """Returns the active provider if it supports file_type; falls back to SimpleParserProvider for docx/txt."""
    if file_type not in _SUPPORTED_FILE_TYPES:
        raise UnsupportedFileType(file_type)

    provider = get_parser_provider()
    if file_type in provider.supported_file_types:
        return provider

    # Active provider doesn't handle this type — fall back to SimpleParserProvider
    if file_type in {"docx", "txt"}:
        from apps.documents.parsing.simple_provider import SimpleParserProvider
        return SimpleParserProvider()

    raise UnsupportedFileType(file_type)
```

---

## Task 8: Model updates

**Files:** Modify `apps/documents/models.py`

- [ ] Add `parser_strategy` to `Document` and `parser_element_type` to `DocumentChunk`:

In `Document` class, after `error_message`:
```python
    parser_strategy = models.CharField(
        max_length=20,
        choices=[("fast", "Fast"), ("hi_res", "Hi-Res"), ("auto", "Auto")],
        null=True,
        blank=True,
        help_text="Per-document strategy override. Null = use UNSTRUCTURED_DEFAULT_STRATEGY env var.",
    )
```

In `DocumentChunk` class, after `page_number`:
```python
    parser_element_type = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Element type from the parser: Title, NarrativeText, Table, ListItem, etc.",
    )
```

---

## Task 9: Migrations

**Files:** Create `apps/documents/migrations/0002_document_parser_fields.py`, `apps/documents/test_migrations/0002_document_parser_fields.py`

- [ ] Create Postgres migration `0002_document_parser_fields.py`:
```python
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("documents", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="document",
            name="parser_strategy",
            field=models.CharField(
                blank=True,
                choices=[("fast", "Fast"), ("hi_res", "Hi-Res"), ("auto", "Auto")],
                help_text="Per-document strategy override. Null = use UNSTRUCTURED_DEFAULT_STRATEGY env var.",
                max_length=20,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="documentchunk",
            name="parser_element_type",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Element type from the parser: Title, NarrativeText, Table, ListItem, etc.",
                max_length=50,
            ),
        ),
    ]
```

- [ ] Create SQLite-compatible test migration `test_migrations/0002_document_parser_fields.py` (identical content — these fields are standard Django, no pgvector involved):
```python
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("documents", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="document",
            name="parser_strategy",
            field=models.CharField(
                blank=True,
                choices=[("fast", "Fast"), ("hi_res", "Hi-Res"), ("auto", "Auto")],
                help_text="Per-document strategy override. Null = use UNSTRUCTURED_DEFAULT_STRATEGY env var.",
                max_length=20,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="documentchunk",
            name="parser_element_type",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Element type from the parser: Title, NarrativeText, Table, ListItem, etc.",
                max_length=50,
            ),
        ),
    ]
```

---

## Task 10: Chunker

**Files:** Create `apps/documents/chunking.py`

- [ ] Create the file. Key rules: tables stay whole, Title/Header start new chunks, NarrativeText concatenated by token count (512 max, 50 overlap).
```python
from __future__ import annotations

from dataclasses import dataclass

from apps.core.logging import get_logger
from apps.documents.parsing.base import ParsedElement

logger = get_logger(__name__)

_CHUNK_MAX_TOKENS = 512
_CHUNK_OVERLAP_TOKENS = 50
_TABLE_MAX_TOKENS = 2000   # tables larger than this get split, all sub-chunks keep type="Table"

_BOUNDARY_TYPES = {"Title", "Header"}
_TABLE_TYPE = "Table"


@dataclass
class Chunk:
    content: str
    element_type: str
    page_number: int | None


def chunk_elements(elements: list[ParsedElement]) -> list[Chunk]:
    """Convert ParsedElements to Chunks respecting semantic boundaries."""
    if not elements:
        return []

    import tiktoken
    enc = tiktoken.get_encoding("cl100k_base")

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
        pending_texts = []
        pending_page = None
        pending_type = "NarrativeText"

    for element in elements:
        etype = element.element_type

        # Tables: flush pending prose, then emit table as its own chunk(s)
        if etype == _TABLE_TYPE:
            flush()
            tokens = enc.encode(element.content)
            if len(tokens) <= _TABLE_MAX_TOKENS:
                chunks.append(Chunk(
                    content=element.content,
                    element_type=_TABLE_TYPE,
                    page_number=element.page_number,
                ))
            else:
                # Split oversized table into sub-chunks, all marked Table
                _split_by_tokens(element.content, _TABLE_TYPE, element.page_number, enc, chunks)
            continue

        # Boundary elements (Title, Header): flush pending, then start fresh with this element
        if etype in _BOUNDARY_TYPES:
            flush()
            pending_texts = [element.content]
            pending_page = element.page_number
            pending_type = etype
            continue

        # PageBreak and other non-content types: flush only
        if etype in {"PageBreak"}:
            flush()
            continue

        # Prose: accumulate
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
        end = min(start + _CHUNK_MAX_TOKENS, len(tokens))
        chunk_tokens = tokens[start:end]
        chunk_text = enc.decode(chunk_tokens).strip()
        if chunk_text:
            chunks.append(Chunk(content=chunk_text, element_type=element_type, page_number=page_number))
        if end >= len(tokens):
            break
        start = end - _CHUNK_OVERLAP_TOKENS
```

---

## Task 11: Ingestion Celery task

**Files:** Create `apps/documents/tasks.py`

- [ ] Create the file:
```python
from __future__ import annotations

import time

from celery import shared_task
from django.conf import settings

from apps.core.logging import get_logger
from apps.documents.chunking import chunk_elements
from apps.documents.embeddings.factory import get_embedding_provider
from apps.documents.exceptions import (
    ParserProviderError,
    ParserStrategyUnavailable,
    UnsupportedFileType,
)
from apps.documents.parsing.factory import get_parser_for_file_type

logger = get_logger(__name__)


@shared_task(bind=True, max_retries=3)
def ingest_document(self, document_id: str, file_bytes_b64: str) -> None:
    """Parse, chunk, and embed a document. Marks it READY or FAILED."""
    import base64

    from apps.documents.models import Document, DocumentChunk

    doc = Document.objects.get(id=document_id)
    file_bytes = base64.b64decode(file_bytes_b64)

    try:
        doc.status = Document.Status.PROCESSING
        doc.save(update_fields=["status"])

        file_type = _file_type_from_mime(doc.mime_type)

        # Strategy: per-document override → env default → "fast"
        strategy = (
            doc.parser_strategy
            or getattr(settings, "UNSTRUCTURED_DEFAULT_STRATEGY", "fast")
        )

        # Parse
        parser = get_parser_for_file_type(file_type)
        logger.info(
            "ingest_document: parsing",
            extra={
                "document_id": document_id,
                "file_type": file_type,
                "strategy": strategy,
                "provider": parser.provider_name,
            },
        )
        parsed = parser.parse(file_bytes, file_type=file_type, strategy=strategy)

        # Chunk
        raw_chunks = chunk_elements(parsed.elements)
        if not raw_chunks:
            logger.warning("ingest_document: 0 chunks produced", extra={"document_id": document_id})

        # Embed + persist
        embedder = get_embedding_provider()
        workspace = doc.workspace
        chunk_objects = []
        for idx, chunk in enumerate(raw_chunks):
            embedding = embedder.embed(chunk.content)
            chunk_objects.append(
                DocumentChunk(
                    document=doc,
                    workspace=workspace,
                    content=chunk.content,
                    chunk_index=idx,
                    page_number=chunk.page_number,
                    parser_element_type=chunk.element_type,
                    embedding=embedding,
                )
            )

        DocumentChunk.objects.bulk_create(chunk_objects)
        doc.status = Document.Status.READY
        doc.save(update_fields=["status"])

        logger.info(
            "ingest_document: complete",
            extra={
                "document_id": document_id,
                "num_chunks": len(chunk_objects),
                "strategy": strategy,
            },
        )

    except (ParserStrategyUnavailable, UnsupportedFileType) as exc:
        doc.status = Document.Status.FAILED
        doc.error_message = str(exc)
        doc.save(update_fields=["status", "error_message"])
        logger.error("ingest_document: config error", extra={"error": str(exc), "document_id": document_id})

    except ParserProviderError as exc:
        doc.status = Document.Status.FAILED
        doc.error_message = str(exc)
        doc.save(update_fields=["status", "error_message"])
        logger.error("ingest_document: parser error", extra={"error": str(exc), "document_id": document_id})
        raise self.retry(exc=exc, countdown=30)

    except Exception as exc:
        doc.status = Document.Status.FAILED
        doc.error_message = f"Unexpected error: {exc}"
        doc.save(update_fields=["status", "error_message"])
        logger.exception("ingest_document: unexpected error", extra={"document_id": document_id})
        raise self.retry(exc=exc, countdown=60)


def _file_type_from_mime(mime_type: str) -> str:
    return {
        "application/pdf": "pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
        "text/plain": "txt",
    }.get(mime_type, mime_type.split("/")[-1])
```

---

## Task 12: Settings + env vars

**Files:** `config/settings/base.py`, `.env`, `.env.example`

- [ ] Add to `config/settings/base.py` in the Provider system block:
```python
PARSER_PROVIDER = env("PARSER_PROVIDER", default="unstructured")
UNSTRUCTURED_DEFAULT_STRATEGY = env("UNSTRUCTURED_DEFAULT_STRATEGY", default="fast")
```

- [ ] Add to `.env`:
```
PARSER_PROVIDER=unstructured
UNSTRUCTURED_DEFAULT_STRATEGY=fast
```

- [ ] Add to `.env.example`:
```
# ── Document parser ───────────────────────────────────────────────────────────
PARSER_PROVIDER=unstructured
UNSTRUCTURED_DEFAULT_STRATEGY=fast
```

---

## Task 13: Test fixtures

**Files:** `tests/fixtures/test.txt`, `tests/fixtures/test.pdf`

- [ ] Create `tests/fixtures/test.txt`:
```
Acme Corp Employee Handbook

Welcome to Acme Corp. We are committed to building a great workplace.

Remote Work Policy: Employees may work remotely up to 3 days per week.

Benefits include health insurance, 401k matching, and flexible hours.
```

- [ ] Create `tests/fixtures/test.pdf` — minimal valid PDF (produced by the make_pdf helper inline in conftest or a script). Add to `tests/conftest.py`:
```python
# At module level, alongside existing fixtures:
import os
FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")
```

And create a pytest fixture:
```python
@pytest.fixture(scope="session")
def fixture_dir():
    return FIXTURES_DIR

@pytest.fixture(scope="session")
def txt_fixture_bytes(fixture_dir):
    path = os.path.join(fixture_dir, "test.txt")
    with open(path, "rb") as f:
        return f.read()

@pytest.fixture(scope="session")
def pdf_fixture_bytes(fixture_dir):
    path = os.path.join(fixture_dir, "test.pdf")
    with open(path, "rb") as f:
        return f.read()
```

- [ ] Generate `tests/fixtures/test.pdf` via a one-time script (run once during setup, check in the result). The minimal PDF bytes from the smoke test setup can be reused.

---

## Task 14: Parser unit tests

**Files:** `tests/test_unstructured_parser.py`, `tests/test_pypdf_parser.py`, `tests/test_parser_factory.py`

(Full test code included in plan — see Tasks 14a, 14b, 14c.)

### 14a — test_unstructured_parser.py
```python
from __future__ import annotations
from unittest.mock import MagicMock, patch
import pytest
from apps.documents.exceptions import ParserStrategyUnavailable
from apps.documents.parsing.unstructured_provider import UnstructuredParserProvider


def _make_element(type_name: str, text: str, page: int | None = 1):
    el = MagicMock()
    el.__class__.__name__ = type_name
    el.__str__ = lambda self: text
    el.metadata.page_number = page
    el.metadata.text_as_html = f"<table>{text}</table>" if type_name == "Table" else None
    el.metadata.filename = "test.pdf"
    return el


@pytest.mark.django_db
def test_parse_pdf_fast_returns_elements():
    mock_elements = [
        _make_element("Title", "Acme Corp Policy", 1),
        _make_element("NarrativeText", "Employees may work 3 days remotely.", 1),
    ]
    with patch("unstructured.partition.auto.partition", return_value=mock_elements):
        provider = UnstructuredParserProvider()
        result = provider.parse(b"%PDF fake", file_type="pdf", strategy="fast")

    assert len(result.elements) == 2
    assert result.elements[0].element_type == "Title"
    assert result.elements[1].element_type == "NarrativeText"
    assert result.metadata["strategy_used"] == "fast"


@pytest.mark.django_db
def test_parse_table_uses_html_content():
    mock_elements = [_make_element("Table", "row1 | row2", 2)]
    with patch("unstructured.partition.auto.partition", return_value=mock_elements):
        provider = UnstructuredParserProvider()
        result = provider.parse(b"%PDF fake", file_type="pdf", strategy="fast")

    assert "<table>" in result.elements[0].content
    assert result.elements[0].element_type == "Table"


@pytest.mark.django_db
def test_hi_res_raises_when_deps_missing():
    provider = UnstructuredParserProvider()
    with patch("unstructured.partition.auto.partition"), \
         patch("builtins.__import__", side_effect=_import_raiser("unstructured.partition.pdf")):
        with pytest.raises(ParserStrategyUnavailable) as exc_info:
            provider.parse(b"%PDF fake", file_type="pdf", strategy="hi_res")
    assert "local-inference" in str(exc_info.value)


@pytest.mark.django_db
def test_parse_returns_page_numbers():
    mock_elements = [
        _make_element("NarrativeText", "Page one content", 1),
        _make_element("NarrativeText", "Page two content", 2),
    ]
    with patch("unstructured.partition.auto.partition", return_value=mock_elements):
        provider = UnstructuredParserProvider()
        result = provider.parse(b"%PDF fake", file_type="pdf", strategy="fast")

    assert result.elements[0].page_number == 1
    assert result.elements[1].page_number == 2


@pytest.mark.django_db
def test_txt_file_parsed():
    mock_elements = [_make_element("NarrativeText", "Hello world", None)]
    with patch("unstructured.partition.auto.partition", return_value=mock_elements):
        provider = UnstructuredParserProvider()
        result = provider.parse(b"Hello world", file_type="txt", strategy="fast")

    assert len(result.elements) == 1


def _import_raiser(blocked: str):
    original = __builtins__.__import__ if hasattr(__builtins__, "__import__") else __import__
    def _side_effect(name, *args, **kwargs):
        if name == blocked or name.startswith(blocked):
            raise ImportError(f"Mocked missing: {name}")
        return original(name, *args, **kwargs)
    return _side_effect
```

### 14b — test_pypdf_parser.py
```python
from __future__ import annotations
from unittest.mock import MagicMock, patch
import pytest
from apps.documents.exceptions import ParserStrategyUnavailable
from apps.documents.parsing.pypdf_provider import PypdfParserProvider


def _make_page(text: str):
    page = MagicMock()
    page.extract_text.return_value = text
    return page


@pytest.mark.django_db
def test_pypdf_parses_pages():
    mock_reader = MagicMock()
    mock_reader.pages = [_make_page("Page one text."), _make_page("Page two text.")]
    with patch("pypdf.PdfReader", return_value=mock_reader):
        provider = PypdfParserProvider()
        result = provider.parse(b"%PDF fake", file_type="pdf", strategy="fast")

    assert len(result.elements) == 2
    assert result.elements[0].element_type == "NarrativeText"
    assert result.elements[0].page_number == 1
    assert result.elements[1].page_number == 2


@pytest.mark.django_db
def test_pypdf_rejects_hi_res():
    provider = PypdfParserProvider()
    with pytest.raises(ParserStrategyUnavailable):
        provider.parse(b"%PDF fake", file_type="pdf", strategy="hi_res")
```

### 14c — test_parser_factory.py
```python
from __future__ import annotations
import pytest
from django.test import override_settings
from apps.documents.exceptions import UnsupportedFileType
from apps.documents.parsing.pypdf_provider import PypdfParserProvider
from apps.documents.parsing.simple_provider import SimpleParserProvider
from apps.documents.parsing.unstructured_provider import UnstructuredParserProvider


def test_get_parser_provider_returns_unstructured():
    with override_settings(PARSER_PROVIDER="unstructured"):
        from apps.documents.parsing.factory import get_parser_provider
        provider = get_parser_provider()
    assert isinstance(provider, UnstructuredParserProvider)


def test_get_parser_provider_returns_pypdf():
    with override_settings(PARSER_PROVIDER="pypdf"):
        from apps.documents.parsing.factory import get_parser_provider
        provider = get_parser_provider()
    assert isinstance(provider, PypdfParserProvider)


def test_get_parser_provider_raises_on_unknown():
    with override_settings(PARSER_PROVIDER="unknown_provider"):
        from apps.documents.parsing.factory import get_parser_provider
        with pytest.raises(ValueError, match="Unknown PARSER_PROVIDER"):
            get_parser_provider()


def test_get_parser_for_docx_falls_back_to_simple_when_pypdf_active():
    with override_settings(PARSER_PROVIDER="pypdf"):
        from apps.documents.parsing.factory import get_parser_for_file_type
        provider = get_parser_for_file_type("docx")
    assert isinstance(provider, SimpleParserProvider)


def test_get_parser_for_unsupported_type_raises():
    with override_settings(PARSER_PROVIDER="unstructured"):
        from apps.documents.parsing.factory import get_parser_for_file_type
        with pytest.raises(UnsupportedFileType):
            get_parser_for_file_type("xlsx")
```

---

## Task 15: Chunker tests

**Files:** `tests/test_chunking_with_elements.py`

```python
from __future__ import annotations
import pytest
from apps.documents.chunking import Chunk, chunk_elements
from apps.documents.parsing.base import ParsedElement


def _el(content: str, etype: str = "NarrativeText", page: int | None = 1) -> ParsedElement:
    return ParsedElement(content=content, element_type=etype, page_number=page)


def test_empty_elements_returns_empty():
    assert chunk_elements([]) == []


def test_narrative_text_produces_chunk():
    elements = [_el("This is a sentence about remote work policy.")]
    chunks = chunk_elements(elements)
    assert len(chunks) == 1
    assert chunks[0].element_type == "NarrativeText"
    assert "remote work" in chunks[0].content


def test_table_stays_whole():
    table_content = "<table><tr><td>Row 1</td></tr><tr><td>Row 2</td></tr></table>"
    elements = [_el(table_content, "Table")]
    chunks = chunk_elements(elements)
    assert len(chunks) == 1
    assert chunks[0].element_type == "Table"
    assert "<table>" in chunks[0].content


def test_title_starts_new_chunk():
    elements = [
        _el("Section One content here.", "NarrativeText"),
        _el("Section Two Title", "Title"),
        _el("Section Two content here.", "NarrativeText"),
    ]
    chunks = chunk_elements(elements)
    # The Title flushes previous prose and starts a new boundary
    assert len(chunks) >= 2
    title_chunks = [c for c in chunks if c.element_type == "Title"]
    assert len(title_chunks) >= 1


def test_mixed_elements_record_element_type():
    elements = [
        _el("Overview", "Title"),
        _el("Employees can work remotely.", "NarrativeText"),
        _el("<table><tr><td>Day</td><td>Hours</td></tr></table>", "Table"),
    ]
    chunks = chunk_elements(elements)
    types = {c.element_type for c in chunks}
    assert "Title" in types or "NarrativeText" in types
    assert "Table" in types


def test_long_text_is_split_into_multiple_chunks():
    # ~600 tokens of text (over 512 limit)
    long_text = "The quick brown fox jumps over the lazy dog. " * 60
    elements = [_el(long_text, "NarrativeText")]
    chunks = chunk_elements(elements)
    assert len(chunks) >= 2
    for chunk in chunks:
        assert len(chunk.content) > 0
```

---

## Task 16: Docker rebuild + migrate

- [ ] Run: `docker compose down && docker compose up -d --build`
- [ ] Run: `docker compose exec web python manage.py migrate`
- [ ] Run: `docker compose exec -e DJANGO_SETTINGS_MODULE=config.settings.testing web python -m pytest tests/test_unstructured_parser.py tests/test_pypdf_parser.py tests/test_parser_factory.py tests/test_chunking_with_elements.py -v --no-cov`
- [ ] Run full suite: `docker compose exec -e DJANGO_SETTINGS_MODULE=config.settings.testing web python -m pytest --no-cov`
- [ ] Run: `docker images | grep backend-web` — record final image size

---

## Task 17: Re-ingest test document

- [ ] Delete existing test doc + chunks via Django shell
- [ ] Re-ingest with unstructured parser via `ingest_document` task (or direct call)
- [ ] Verify `parser_element_type` fields are populated on chunks
- [ ] Verify at least one chunk has element_type != "NarrativeText"

---
