"""OpenAI text embedding provider using ``text-embedding-3-small``."""
from __future__ import annotations

import openai
from django.conf import settings

from apps.core.constants import EMBEDDING_DIMENSIONS, OPENAI_EMBEDDING_MODEL
from apps.core.logging import get_logger
from apps.documents.embeddings.base import BaseEmbeddingProvider

logger = get_logger(__name__)


class OpenAIEmbeddingProvider(BaseEmbeddingProvider):
    """Generate 768-dim embeddings via the OpenAI embeddings API.

    Uses Matryoshka truncation (``dimensions`` param) to produce
    768-dim vectors from the ``text-embedding-3-small`` model.
    """

    def __init__(self, api_key: str | None = None) -> None:
        self._client = openai.OpenAI(
            api_key=api_key or settings.DEFAULT_PLATFORM_OPENAI_API_KEY,
            timeout=getattr(settings, "PROVIDER_REQUEST_TIMEOUT_SECONDS", 30),
        )

    def embed(self, text: str, *, task_type: str = "retrieval_query") -> list[float]:
        """Return a 768-dimensional embedding for *text*.

        The *task_type* parameter is accepted for interface compatibility
        but ignored — OpenAI embeddings do not use task type hints.

        Raises:
            openai.AuthenticationError: Invalid API key.
            openai.RateLimitError: Quota exceeded.
            openai.APIError: Transient API failure.
        """
        try:
            resp = self._client.embeddings.create(
                model=OPENAI_EMBEDDING_MODEL,
                input=text,
                dimensions=EMBEDDING_DIMENSIONS,
            )
            return resp.data[0].embedding
        except openai.AuthenticationError:
            logger.error("OpenAI embedding auth failed — check DEFAULT_PLATFORM_OPENAI_API_KEY")
            raise
        except openai.RateLimitError:
            logger.warning("OpenAI embedding rate limit hit")
            raise
        except Exception:
            logger.exception("OpenAI embedding request failed")
            raise
