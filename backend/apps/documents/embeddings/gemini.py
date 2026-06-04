"""Google Gemini text embedding provider using ``text-embedding-004``."""
from __future__ import annotations

import requests
from django.conf import settings

from apps.core.constants import GEMINI_EMBEDDING_MODEL
from apps.core.logging import get_logger
from apps.documents.embeddings.base import BaseEmbeddingProvider

logger = get_logger(__name__)

_EMBED_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/{GEMINI_EMBEDDING_MODEL}:embedContent"
)


class GeminiEmbeddingProvider(BaseEmbeddingProvider):
    """Generate embeddings via the Google Generative AI REST v1beta API."""

    def embed(self, text: str, *, task_type: str = "retrieval_query") -> list[float]:
        """Return an embedding vector for *text* using Gemini ``text-embedding-004``.

        Uses the REST v1beta endpoint directly — AI Studio API keys are scoped
        to v1beta and the google-generativeai SDK 0.7.x has a routing bug.

        Args:
            task_type: ``"retrieval_document"`` for ingested chunks,
                ``"retrieval_query"`` for user queries (asymmetric retrieval).

        Raises:
            requests.HTTPError: Non-2xx response from the Gemini API.
        """
        try:
            resp = requests.post(
                _EMBED_URL,
                params={"key": settings.DEFAULT_PLATFORM_GEMINI_API_KEY},
                json={
                    "model": GEMINI_EMBEDDING_MODEL,
                    "content": {"parts": [{"text": text}]},
                    "taskType": task_type.upper(),
                },
                timeout=30,
            )
            if not resp.ok:
                logger.error(
                    "Gemini embedding API error status=%s body=%s",
                    resp.status_code,
                    resp.text,
                )
            resp.raise_for_status()
            return resp.json()["embedding"]["values"]
        except Exception:
            logger.exception("Gemini embedding request failed")
            raise
