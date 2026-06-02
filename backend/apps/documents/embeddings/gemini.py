from __future__ import annotations

import google.generativeai as genai
from django.conf import settings

from apps.documents.embeddings.base import BaseEmbeddingProvider

_MODEL = "models/text-embedding-004"


class GeminiEmbeddingProvider(BaseEmbeddingProvider):
    def embed(self, text: str) -> list[float]:
        genai.configure(api_key=settings.DEFAULT_PLATFORM_GEMINI_API_KEY)
        result = genai.embed_content(model=_MODEL, content=text, task_type="retrieval_query")
        return result["embedding"]
