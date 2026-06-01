from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

import google.generativeai as genai
from django.conf import settings

from apps.core.logging import get_logger
from apps.documents.models import DocumentChunk

logger = get_logger(__name__)

_EMBEDDING_MODEL = "models/text-embedding-004"


def _embed_query(query: str) -> list[float]:
    api_key = settings.DEFAULT_PLATFORM_GEMINI_API_KEY
    genai.configure(api_key=api_key)
    result = genai.embed_content(
        model=_EMBEDDING_MODEL,
        content=query,
        task_type="retrieval_query",
    )
    return result["embedding"]


@dataclass
class RetrievedChunk:
    chunk_id: UUID
    content: str
    score: float
    document_id: UUID
    document_filename: str
    page_number: int | None


def retrieve_chunks_for_query(
    workspace_id: UUID,
    query: str,
    top_k: int = 5,
    min_score: float = 0.5,
) -> list[RetrievedChunk]:
    from pgvector.django import CosineDistance

    query_embedding = _embed_query(query)

    qs = (
        DocumentChunk.objects.filter(workspace_id=workspace_id)
        .select_related("document")
        .annotate(distance=CosineDistance("embedding", query_embedding))
        .filter(distance__lt=(1 - min_score))
        .order_by("distance")[:top_k]
    )

    chunks = [
        RetrievedChunk(
            chunk_id=chunk.id,
            content=chunk.content,
            score=round(1 - float(chunk.distance), 4),
            document_id=chunk.document_id,
            document_filename=chunk.document.filename,
            page_number=chunk.page_number,
        )
        for chunk in qs
    ]

    logger.info(
        "Retrieval complete",
        extra={
            "workspace_id": str(workspace_id),
            "query_preview": query[:100],
            "num_results": len(chunks),
            "top_score": chunks[0].score if chunks else None,
        },
    )
    return chunks
