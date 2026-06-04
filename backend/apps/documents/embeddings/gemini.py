"""Google Gemini text embedding provider using ``text-embedding-004``."""
from __future__ import annotations

import google.generativeai as genai
from django.conf import settings

from apps.core.constants import GEMINI_EMBEDDING_MODEL
from apps.core.logging import get_logger
from apps.documents.embeddings.base import BaseEmbeddingProvider

logger = get_logger(__name__)


class GeminiEmbeddingProvider(BaseEmbeddingProvider):
    """Generate embeddings via the Google Generative AI embeddings API."""

    def embed(self, text: str, *, task_type: str = "retrieval_query") -> list[float]:
        """Return an embedding vector for *text* using Gemini ``text-embedding-004``.

        Args:
            task_type: ``"retrieval_document"`` for ingested chunks,
                ``"retrieval_query"`` for user queries (asymmetric retrieval).

        Raises:
            google.api_core.exceptions.PermissionDenied: Invalid API key.
            google.api_core.exceptions.ResourceExhausted: Quota exceeded.
        """
        try:
            genai.configure(api_key=settings.DEFAULT_PLATFORM_GEMINI_API_KEY)
            result = genai.embed_content(
                model=GEMINI_EMBEDDING_MODEL, content=text, task_type=task_type
            )
            return result["embedding"]
        except Exception:
            logger.exception("Gemini embedding request failed")
            raise
