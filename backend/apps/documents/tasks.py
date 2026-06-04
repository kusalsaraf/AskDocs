from __future__ import annotations

import base64
import time

from celery import shared_task
from django.conf import settings

from apps.core.constants import (
    INGEST_MAX_RETRIES,
    INGEST_RETRY_COUNTDOWN_GENERAL,
    INGEST_RETRY_COUNTDOWN_PARSER,
    MIME_TO_FILE_TYPE,
    STUCK_DOCUMENT_TIMEOUT_MINUTES,
)
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


@shared_task(bind=True, max_retries=INGEST_MAX_RETRIES)
def ingest_document(self, document_id: str, file_bytes_b64: str) -> None:
    """Parse, chunk, embed, and persist a document. Marks Document READY or FAILED."""
    from apps.documents.models import Document, DocumentChunk

    try:
        doc = Document.objects.get(id=document_id)
    except Document.DoesNotExist:
        logger.error("Document not found — may have been deleted", extra={"document_id": document_id})
        return

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
            content = chunk.content.replace("\x00", "")
            if not content.strip():
                continue
            embedding = embedder.embed(content, task_type="retrieval_document")
            chunk_objects.append(
                DocumentChunk(
                    document=doc,
                    workspace=workspace,
                    content=content,
                    chunk_index=idx,
                    page_number=chunk.page_number,
                    parser_element_type=chunk.element_type,
                    embedding=embedding,
                )
            )

        DocumentChunk.objects.filter(document=doc).delete()
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
        doc.error_message = "Document parsing failed. Please try re-uploading."
        doc.save(update_fields=["status", "error_message"])
        logger.error(
            "ingest_document: parser error",
            extra={"error": str(exc), "document_id": document_id},
        )
        raise self.retry(exc=exc, countdown=INGEST_RETRY_COUNTDOWN_PARSER)

    except Exception as exc:
        doc.status = Document.Status.FAILED
        doc.error_message = "An unexpected error occurred during document processing."
        doc.save(update_fields=["status", "error_message"])
        logger.exception(
            "ingest_document: unexpected error",
            extra={"document_id": document_id},
        )
        raise self.retry(exc=exc, countdown=INGEST_RETRY_COUNTDOWN_GENERAL)


def _mime_to_file_type(mime_type: str) -> str:
    return MIME_TO_FILE_TYPE.get(mime_type, mime_type.split("/")[-1])


@shared_task
def reap_stuck_documents() -> int:
    """Mark documents stuck in pending/processing for >30 minutes as failed."""
    from datetime import timedelta

    from django.utils import timezone

    from apps.documents.models import Document

    cutoff = timezone.now() - timedelta(minutes=STUCK_DOCUMENT_TIMEOUT_MINUTES)
    stuck = Document.objects.filter(
        status__in=[Document.Status.PENDING, Document.Status.PROCESSING],
        updated_at__lt=cutoff,
    )
    count = stuck.update(
        status=Document.Status.FAILED,
        error_message="Document processing timed out. Please re-upload the file.",
    )
    if count:
        logger.info("reap_stuck_documents: marked %d stuck documents as failed", count)
    return count
