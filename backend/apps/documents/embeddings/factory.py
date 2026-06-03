"""Factory for selecting the configured embedding provider."""
from __future__ import annotations

from django.conf import settings

from apps.documents.embeddings.base import BaseEmbeddingProvider


def get_embedding_provider() -> BaseEmbeddingProvider:
    """Return the embedding provider configured via ``settings.EMBEDDING_PROVIDER``.

    Supported values: ``"openai"`` (default), ``"gemini"``.

    Raises:
        ValueError: If the configured provider name is unrecognised.
    """
    provider = getattr(settings, "EMBEDDING_PROVIDER", "openai")
    if provider == "openai":
        from apps.documents.embeddings.openai import OpenAIEmbeddingProvider
        return OpenAIEmbeddingProvider()
    if provider == "gemini":
        from apps.documents.embeddings.gemini import GeminiEmbeddingProvider
        return GeminiEmbeddingProvider()
    raise ValueError(f"Unknown EMBEDDING_PROVIDER: {provider!r}. Valid values: openai, gemini")
