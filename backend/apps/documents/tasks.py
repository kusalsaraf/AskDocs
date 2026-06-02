from __future__ import annotations

import base64
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

_MIME_TO_FILE_TYPE: dict[str, str] = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "text/plain": "txt",
}


@shared_task(bind=True, max_retries=3)
def ingest_document(self, document_id: str, file_bytes_b64: str) -> None:
    """Parse, chunk, embed, and persist a document. Marks Document READY or FAILED."""
    from apps.documents.models import Document, DocumentChunk

    doc = Document.objects.get(id=document_id)
    file_bytes = base64.b64decode(file_bytes_b64)

    try:
        doc.status = Document.Status.PROCESSING
        doc.save(update_fields=["status"])

        file_type = _mime_to_file_type(doc.mime_type)

        # Strategy: per-document override → env default → "fast"
        strategy: str = (
            doc.parser_strategy
            or getattr(settings, "UNSTRUCTURED_DEFAULT_STRATEGY", "fast")
        )

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

        raw_chunks = chunk_elements(parsed.elements)
        if not raw_chunks:
            logger.warning(
                "ingest_document: 0 chunks produced",
                extra={"document_id": document_id},
            )

        embedder = get_embedding_provider()
        workspace = doc.workspace
        chunk_objects: list[DocumentChunk] = []

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
                "provider": parser.provider_name,
            },
        )

    except (ParserStrategyUnavailable, UnsupportedFileType) as exc:
        doc.status = Document.Status.FAILED
        doc.error_message = str(exc)
        doc.save(update_fields=["status", "error_message"])
        logger.error(
            "ingest_document: config error",
            extra={"error": str(exc), "document_id": document_id},
        )

    except ParserProviderError as exc:
        doc.status = Document.Status.FAILED
        doc.error_message = str(exc)
        doc.save(update_fields=["status", "error_message"])
        logger.error(
            "ingest_document: parser error",
            extra={"error": str(exc), "document_id": document_id},
        )
        raise self.retry(exc=exc, countdown=30)

    except Exception as exc:
        doc.status = Document.Status.FAILED
        doc.error_message = f"Unexpected error: {exc}"
        doc.save(update_fields=["status", "error_message"])
        logger.exception(
            "ingest_document: unexpected error",
            extra={"document_id": document_id},
        )
        raise self.retry(exc=exc, countdown=60)


def _mime_to_file_type(mime_type: str) -> str:
    return _MIME_TO_FILE_TYPE.get(mime_type, mime_type.split("/")[-1])
