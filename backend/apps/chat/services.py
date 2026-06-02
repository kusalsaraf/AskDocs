from __future__ import annotations

import re
import time
from collections.abc import Iterator
from dataclasses import dataclass
from typing import TYPE_CHECKING
from uuid import UUID

from django.conf import settings
from django.utils import timezone

from apps.chat.cache import CachedResponse, cache_key_for_query, cache_response, get_cached_response
from apps.chat.limits import (
    check_and_increment_global_budget,
    check_and_increment_user_limit,
)
from apps.chat.models import Conversation, Message
from apps.chat.prompts import build_rag_prompt
from apps.chat.retrieval import retrieve_chunks_for_query
from apps.core.logging import get_logger
from apps.providers.llm.exceptions import (
    ProviderAuthError,
    ProviderRateLimitError,
    ProviderTimeoutError,
)
from apps.providers.services import get_active_provider

if TYPE_CHECKING:
    from apps.accounts.models import User
    from apps.workspaces.models import Workspace

logger = get_logger(__name__)


@dataclass
class ChatStreamEvent:
    type: str  # "token" | "complete" | "error"
    content: str | None = None
    citations: dict[int, str] | None = None
    message_id: UUID | None = None
    is_cached: bool = False
    error_code: str | None = None

    def to_dict(self) -> dict:
        if self.type == "token":
            return {"delta": self.content}
        if self.type == "complete":
            return {
                "message_id": str(self.message_id),
                "citations": {str(k): str(v) for k, v in (self.citations or {}).items()},
                "is_cached": self.is_cached,
            }
        return {"code": self.error_code, "message": self.content}


def _is_using_platform_default(workspace: Workspace) -> bool:
    from apps.providers.models import ProviderConfig

    return not ProviderConfig.objects.filter(workspace=workspace).exists()


def _extract_citation_indices(text: str) -> list[int]:
    return [int(n) for n in re.findall(r"\[(\d+)\]", text)]


def _build_citations_map(
    used_indices: list[int], chunks: list
) -> list[dict]:
    result = []
    for idx in sorted(set(used_indices)):
        if 1 <= idx <= len(chunks):
            chunk = chunks[idx - 1]
            result.append(
                {
                    "index": idx,
                    "chunk_id": str(chunk.chunk_id),
                    "document_id": str(chunk.document_id),
                    "page_number": chunk.page_number,
                }
            )
    return result


def _build_citations_index_map(
    used_indices: list[int], chunks: list
) -> dict[int, str]:
    result: dict[int, str] = {}
    for idx in sorted(set(used_indices)):
        if 1 <= idx <= len(chunks):
            result[idx] = str(chunks[idx - 1].chunk_id)
    return result


def stream_chat_response(
    workspace: Workspace,
    conversation: Conversation,
    user_message_content: str,
    user: User,
    top_k: int = 5,
) -> Iterator[ChatStreamEvent]:
    using_platform_default = _is_using_platform_default(workspace)

    # 1. Per-user rate limit
    check_and_increment_user_limit(user.id)

    # 2. Global budget (platform default only)
    if using_platform_default:
        check_and_increment_global_budget()

    # 3. Persist the user message
    user_msg = Message.objects.create(
        conversation=conversation,
        workspace=workspace,
        role=Message.Role.USER,
        content=user_message_content,
    )

    # 4. Retrieve chunks
    chunks = retrieve_chunks_for_query(
        workspace_id=workspace.id,
        query=user_message_content,
        top_k=top_k,
        min_score=0.5,
    )
    chunk_ids = [c.chunk_id for c in chunks]

    # 5. Check response cache
    cache_key = cache_key_for_query(workspace.id, chunk_ids, user_message_content)
    cached = get_cached_response(cache_key)
    if cached is not None:
        assistant_msg = _persist_assistant_message(
            conversation=conversation,
            workspace=workspace,
            content=cached.full_text,
            citations=_build_citations_map(
                _extract_citation_indices(cached.full_text), chunks
            ),
            chunks=chunks,
            provider_name=cached.provider_name,
            model_name=cached.model_name,
            prompt_tokens=cached.prompt_tokens,
            completion_tokens=cached.completion_tokens,
            latency_ms=0,
            is_cached=True,
        )
        _finalize_conversation(conversation, user_message_content)
        full_text = cached.full_text
        chunk_size = 80
        for i in range(0, len(full_text), chunk_size):
            yield ChatStreamEvent(type="token", content=full_text[i : i + chunk_size])
        yield ChatStreamEvent(
            type="complete",
            citations=cached.citations,
            message_id=assistant_msg.id,
            is_cached=True,
        )
        return

    # 6. Conversation history (last N messages, bounded)
    max_turns = getattr(settings, "CHAT_MAX_HISTORY_TURNS", 6)
    history = list(
        Message.objects.filter(conversation=conversation)
        .exclude(id=user_msg.id)
        .order_by("-created_at")[: max_turns]
    )
    history.reverse()

    # 7. Build prompt
    provider_messages = build_rag_prompt(
        query=user_message_content,
        retrieved_chunks=chunks,
        conversation_history=history,
        max_history_turns=max_turns,
    )

    # 8. Get active provider
    provider = get_active_provider(workspace)

    # 9. Stream from provider
    full_response = []
    start_time = time.monotonic()
    assistant_msg = None

    try:
        for stream_chunk in provider.stream(provider_messages):
            if stream_chunk.delta:
                full_response.append(stream_chunk.delta)
                yield ChatStreamEvent(type="token", content=stream_chunk.delta)
    except ProviderAuthError as exc:
        error_msg = _save_error_message(
            conversation, workspace, str(exc), provider, "auth_failed"
        )
        yield ChatStreamEvent(
            type="error",
            error_code="provider_auth_failed",
            content=str(exc),
            message_id=error_msg.id,
        )
        raise
    except ProviderRateLimitError as exc:
        error_msg = _save_error_message(
            conversation, workspace, str(exc), provider, "provider_rate_limited"
        )
        yield ChatStreamEvent(
            type="error",
            error_code="provider_rate_limited",
            content=str(exc),
            message_id=error_msg.id,
        )
        return
    except ProviderTimeoutError as exc:
        error_msg = _save_error_message(
            conversation, workspace, str(exc), provider, "provider_timeout"
        )
        yield ChatStreamEvent(
            type="error",
            error_code="provider_timeout",
            content=str(exc),
            message_id=error_msg.id,
        )
        return
    except Exception as exc:
        error_msg = _save_error_message(
            conversation, workspace, str(exc), provider, "provider_error"
        )
        yield ChatStreamEvent(
            type="error",
            error_code="provider_error",
            content=str(exc),
            message_id=error_msg.id,
        )
        raise

    latency_ms = int((time.monotonic() - start_time) * 1000)
    full_text = "".join(full_response)

    # 10-11. Extract citations and persist assistant message
    used_indices = _extract_citation_indices(full_text)
    citations_list = _build_citations_map(used_indices, chunks)
    citations_index_map = _build_citations_index_map(used_indices, chunks)

    retrieved_snapshot = [
        {
            "chunk_id": str(c.chunk_id),
            "content": c.content,
            "score": c.score,
            "document_id": str(c.document_id),
            "document_filename": c.document_filename,
            "page_number": c.page_number,
        }
        for c in chunks
    ]

    assistant_msg = _persist_assistant_message(
        conversation=conversation,
        workspace=workspace,
        content=full_text,
        citations=citations_list,
        chunks=chunks,
        provider_name=provider.provider_name,
        model_name=getattr(provider, "_model_name", ""),
        prompt_tokens=None,
        completion_tokens=None,
        latency_ms=latency_ms,
        is_cached=False,
        retrieved_snapshot=retrieved_snapshot,
    )

    # 12. Cache the response
    cache_response(
        cache_key,
        CachedResponse(
            full_text=full_text,
            citations=citations_index_map,
            provider_name=provider.provider_name,
            model_name=getattr(provider, "_model_name", ""),
            prompt_tokens=0,
            completion_tokens=0,
        ),
        ttl_seconds=getattr(settings, "CHAT_RESPONSE_CACHE_TTL_SECONDS", 86400),
    )

    # 13. Update conversation
    _finalize_conversation(conversation, user_message_content)

    # 15. Yield complete event
    yield ChatStreamEvent(
        type="complete",
        citations=citations_index_map,
        message_id=assistant_msg.id,
        is_cached=False,
    )


def _persist_assistant_message(
    *,
    conversation: Conversation,
    workspace: Workspace,
    content: str,
    citations: list[dict],
    chunks: list,
    provider_name: str,
    model_name: str,
    prompt_tokens: int | None,
    completion_tokens: int | None,
    latency_ms: int,
    is_cached: bool,
    retrieved_snapshot: list[dict] | None = None,
) -> Message:
    if retrieved_snapshot is None:
        retrieved_snapshot = [
            {
                "chunk_id": str(c.chunk_id),
                "content": c.content,
                "score": c.score,
                "document_id": str(c.document_id),
                "document_filename": c.document_filename,
                "page_number": c.page_number,
            }
            for c in chunks
        ]
    return Message.objects.create(
        conversation=conversation,
        workspace=workspace,
        role=Message.Role.ASSISTANT,
        content=content,
        citations=citations,
        retrieved_chunks=retrieved_snapshot,
        provider_name=provider_name,
        model_name=model_name,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        latency_ms=latency_ms,
        is_cached=is_cached,
    )


def _save_error_message(
    conversation: Conversation,
    workspace: Workspace,
    error_text: str,
    provider,
    error_code: str,
) -> Message:
    return Message.objects.create(
        conversation=conversation,
        workspace=workspace,
        role=Message.Role.ASSISTANT,
        content="",
        provider_name=getattr(provider, "provider_name", ""),
        model_name=getattr(provider, "_model_name", ""),
        error_message=f"[{error_code}] {error_text}",
    )


def _finalize_conversation(conversation: Conversation, first_user_message: str) -> None:
    updates: dict = {"last_message_at": timezone.now()}
    if conversation.title == "New conversation":
        title = first_user_message[:100].strip()
        if title:
            updates["title"] = title
    Conversation.objects.filter(id=conversation.id).update(**updates)
    conversation.refresh_from_db(fields=list(updates.keys()))
