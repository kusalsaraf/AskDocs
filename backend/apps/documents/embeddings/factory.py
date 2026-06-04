"""Factory for selecting the embedding provider that matches the workspace's LLM provider."""
from __future__ import annotations

from typing import TYPE_CHECKING

from django.conf import settings

from apps.documents.embeddings.base import BaseEmbeddingProvider

if TYPE_CHECKING:
    from apps.workspaces.models import Workspace


def get_embedding_provider(workspace: "Workspace | None" = None) -> BaseEmbeddingProvider:
    """Return the embedding provider matching the workspace's active LLM provider.

    Resolution order:
    1. Workspace ProviderConfig → openai uses OpenAI embeddings, gemini uses Gemini
    2. Platform default (DEFAULT_PLATFORM_PROVIDER setting)
    3. Providers without a native embedding API (anthropic, groq, etc.) fall back
       to the platform default embedding provider.
    """
    provider_name: str | None = None
    api_key: str | None = None

    if workspace is not None:
        from apps.providers.crypto import decrypt_api_key
        from apps.providers.models import ProviderConfig

        try:
            config = ProviderConfig.objects.get(workspace=workspace)
            provider_name = config.provider_name
            if config.encrypted_api_key:
                api_key = decrypt_api_key(bytes(config.encrypted_api_key))
        except ProviderConfig.DoesNotExist:
            pass

    if provider_name is None:
        provider_name = getattr(settings, "DEFAULT_PLATFORM_PROVIDER", "gemini")

    if provider_name == "openai":
        from apps.documents.embeddings.openai import OpenAIEmbeddingProvider
        return OpenAIEmbeddingProvider(api_key=api_key)

    if provider_name == "gemini":
        from apps.documents.embeddings.gemini import GeminiEmbeddingProvider
        return GeminiEmbeddingProvider(api_key=api_key)

    # Providers without a native embedding API (anthropic, groq, azure, etc.)
    # fall back to the platform default so ingestion still works.
    platform = getattr(settings, "DEFAULT_PLATFORM_PROVIDER", "gemini")
    if platform == "openai":
        from apps.documents.embeddings.openai import OpenAIEmbeddingProvider
        return OpenAIEmbeddingProvider()
    from apps.documents.embeddings.gemini import GeminiEmbeddingProvider
    return GeminiEmbeddingProvider()
