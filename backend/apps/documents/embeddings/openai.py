from __future__ import annotations

import openai
from django.conf import settings

from apps.documents.embeddings.base import BaseEmbeddingProvider

_MODEL = "text-embedding-3-small"
# Matches the existing VectorField(dimensions=768). OpenAI supports Matryoshka truncation
# via the `dimensions` parameter, so we get 768-dim vectors without a schema migration.
_DIMENSIONS = 768


class OpenAIEmbeddingProvider(BaseEmbeddingProvider):
    def __init__(self) -> None:
        self._client = openai.OpenAI(
            api_key=settings.DEFAULT_PLATFORM_OPENAI_API_KEY,
            timeout=getattr(settings, "PROVIDER_REQUEST_TIMEOUT_SECONDS", 30),
        )

    def embed(self, text: str) -> list[float]:
        resp = self._client.embeddings.create(
            model=_MODEL,
            input=text,
            dimensions=_DIMENSIONS,
        )
        return resp.data[0].embedding
