from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from uuid import UUID

from django.core.cache import cache

from apps.core.logging import get_logger

logger = get_logger(__name__)


@dataclass
class CachedResponse:
    full_text: str
    citations: dict[int, str]
    provider_name: str
    model_name: str
    prompt_tokens: int
    completion_tokens: int


def _normalize_query(query: str) -> str:
    return re.sub(r"\s+", " ", query.lower().strip())


def cache_key_for_query(workspace_id: UUID, chunk_ids: list[UUID], query: str) -> str:
    normalized = _normalize_query(query)
    sorted_ids = sorted(str(cid) for cid in chunk_ids)
    combined = f"{workspace_id}:{':'.join(sorted_ids)}:{normalized}"
    digest = hashlib.sha256(combined.encode()).hexdigest()
    return f"chat:cache:{digest}"


def get_cached_response(key: str) -> CachedResponse | None:
    data = cache.get(key)
    if data is None:
        return None
    logger.info("Cache hit", extra={"key": key[:32]})
    return CachedResponse(**data)


def cache_response(key: str, response: CachedResponse, ttl_seconds: int = 86400) -> None:
    cache.set(
        key,
        {
            "full_text": response.full_text,
            "citations": response.citations,
            "provider_name": response.provider_name,
            "model_name": response.model_name,
            "prompt_tokens": response.prompt_tokens,
            "completion_tokens": response.completion_tokens,
        },
        timeout=ttl_seconds,
    )
    logger.info("Response cached", extra={"key": key[:32], "ttl": ttl_seconds})
