"""Abstract base class for document embedding providers."""
from __future__ import annotations

from abc import ABC, abstractmethod


class BaseEmbeddingProvider(ABC):
    """Interface for text embedding providers (OpenAI, Gemini, etc.).

    Implementations must return a fixed-dimensional float vector
    suitable for cosine-similarity search in pgvector.
    """

    @abstractmethod
    def embed(self, text: str, *, task_type: str = "retrieval_query") -> list[float]:
        """Convert *text* into a dense embedding vector.

        Args:
            text: The input text to embed.
            task_type: Hint for asymmetric retrieval models.
                ``"retrieval_document"`` for ingested content,
                ``"retrieval_query"`` for user queries.
                Providers that don't support task types may ignore this.

        Raises:
            Exception: On API authentication, rate-limit, or network failures.
        """
        ...
