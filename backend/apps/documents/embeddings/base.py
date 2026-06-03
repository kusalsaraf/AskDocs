"""Abstract base class for document embedding providers."""
from __future__ import annotations

from abc import ABC, abstractmethod


class BaseEmbeddingProvider(ABC):
    """Interface for text embedding providers (OpenAI, Gemini, etc.).

    Implementations must return a fixed-dimensional float vector
    suitable for cosine-similarity search in pgvector.
    """

    @abstractmethod
    def embed(self, text: str) -> list[float]:
        """Convert *text* into a dense embedding vector.

        Raises:
            Exception: On API authentication, rate-limit, or network failures.
        """
        ...
