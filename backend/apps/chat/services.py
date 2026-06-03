"""Orchestrate RAG chat: retrieval, LLM streaming, caching, limits, and persistence."""

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
    record_failed_attempt,
    record_usage,
)
from apps.chat.models import Conversation, Message
from apps.chat.prompts import build_rag_prompt
from apps.chat.retrieval import retrieve_chunks_for_query
from apps.core.constants import (
    CACHED_STREAM_CHUNK_SIZE,
    DAILY_CACHE_TTL_SECONDS,
    DEFAULT_CONVERSATION_TITLE,
    ERR_PROVIDER_AUTH,
    ERR_PROVIDER_ERROR,
    ERR_PROVIDER_RATE_LIMIT,
    ERR_PROVIDER_TIMEOUT,
    MIN_RETRIEVAL_SCORE,
    MSG_INTERNAL_ERROR,
    MSG_PROVIDER_AUTH_FAILED,
    MSG_PROVIDER_ERROR,
    MSG_PROVIDER_RATE_LIMITED,
    MSG_PROVIDER_TIMEOUT,
)
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
    """SSE-friendly event emitted during a chat stream (token, complete, or error)."""

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


_SMALL_TALK_PATTERNS = {
    "hi", "hello", "hey", "hola", "howdy", "yo",
    "thanks", "thank you", "thx", "ty", "thank",
    "bye", "goodbye", "see you", "cya",
    "good morning", "good afternoon", "good evening", "good night",
    "how are you", "what's up", "whats up", "sup",
    "who are you", "what are you", "what can you do",
    "help", "help me",
    "ok", "okay", "sure", "yes", "no", "yep", "nope", "got it",
    "nice", "great", "awesome", "cool", "wow",
}


def _is_small_talk(text: str) -> bool:
    cleaned = text.lower().strip().rstrip("?!.,")
    if cleaned in _SMALL_TALK_PATTERNS:
        return True
    if len(cleaned.split()) <= 3 and any(cleaned.startswith(p) for p in _SMALL_TALK_PATTERNS):
        return True
    return False


def stream_chat_response(
    workspace: Workspace,
    conversation: Conversation,
    user_message_content: str,
    user: User,
    top_k: int = settings.CHAT_DEFAULT_TOP_K,
) -> Iterator[ChatStreamEvent]:
    """Run the full RAG pipeline and yield streaming events for one user turn.

    Enforces rate limits, retrieves chunks, checks cache, streams from the LLM,
    persists messages, and records usage. Yields token deltas and a final complete
    or error event.
    """
    using_platform_default = _is_using_platform_default(workspace)

    # 1. Per-user per-workspace rate limit
    check_and_increment_user_limit(user.id, workspace.id)

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

    # 4. Retrieve chunks (skip for greetings / small talk)
    if _is_small_talk(user_message_content):
        chunks: list = []
    else:
        chunks = retrieve_chunks_for_query(
            workspace_id=workspace.id,
            query=user_message_content,
            top_k=top_k,
            min_score=MIN_RETRIEVAL_SCORE,
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
        record_usage(
            workspace_id=workspace.id,
            user_id=user.id,
            prompt_tokens=cached.prompt_tokens or 0,
            completion_tokens=cached.completion_tokens or 0,
        )
        full_text = cached.full_text
        chunk_size = CACHED_STREAM_CHUNK_SIZE
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
    max_turns = settings.CHAT_MAX_HISTORY_TURNS
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
        from apps.chat.limits import decrement_global_budget, decrement_user_limit

        decrement_user_limit(user.id, workspace.id)
        if using_platform_default:
            decrement_global_budget()
        record_failed_attempt(workspace_id=workspace.id, user_id=user.id)
        error_msg = _save_error_message(
            conversation, workspace, str(exc), provider, "auth_failed"
        )
        yield ChatStreamEvent(
            type="error",
            error_code=ERR_PROVIDER_AUTH,
            content=MSG_PROVIDER_AUTH_FAILED,
            message_id=error_msg.id,
        )
        raise
    except ProviderRateLimitError as exc:
        from apps.chat.limits import decrement_global_budget, decrement_user_limit

        decrement_user_limit(user.id, workspace.id)
        if using_platform_default:
            decrement_global_budget()
        record_failed_attempt(workspace_id=workspace.id, user_id=user.id)
        error_msg = _save_error_message(
            conversation, workspace, str(exc), provider, "provider_rate_limited"
        )
        yield ChatStreamEvent(
            type="error",
            error_code=ERR_PROVIDER_RATE_LIMIT,
            content=MSG_PROVIDER_RATE_LIMITED,
            message_id=error_msg.id,
        )
        return
    except ProviderTimeoutError as exc:
        from apps.chat.limits import decrement_global_budget, decrement_user_limit

        decrement_user_limit(user.id, workspace.id)
        if using_platform_default:
            decrement_global_budget()
        record_failed_attempt(workspace_id=workspace.id, user_id=user.id)
        error_msg = _save_error_message(
            conversation, workspace, str(exc), provider, "provider_timeout"
        )
        yield ChatStreamEvent(
            type="error",
            error_code=ERR_PROVIDER_TIMEOUT,
            content=MSG_PROVIDER_TIMEOUT,
            message_id=error_msg.id,
        )
        return
    except Exception as exc:
        from apps.chat.limits import decrement_global_budget, decrement_user_limit

        decrement_user_limit(user.id, workspace.id)
        if using_platform_default:
            decrement_global_budget()
        record_failed_attempt(workspace_id=workspace.id, user_id=user.id)
        error_msg = _save_error_message(
            conversation, workspace, str(exc), provider, "provider_error"
        )
        yield ChatStreamEvent(
            type="error",
            error_code=ERR_PROVIDER_ERROR,
            content=MSG_PROVIDER_ERROR,
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

    # 12. Record usage in DB
    record_usage(
        workspace_id=workspace.id,
        user_id=user.id,
        prompt_tokens=assistant_msg.prompt_tokens or 0,
        completion_tokens=assistant_msg.completion_tokens or 0,
    )

    # 13. Cache the response
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
        ttl_seconds=getattr(settings, "CHAT_RESPONSE_CACHE_TTL_SECONDS", DAILY_CACHE_TTL_SECONDS),
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
    """Persist an assistant message with a user-facing error and log the failure."""
    user_facing_messages = {
        "auth_failed": MSG_PROVIDER_AUTH_FAILED,
        "provider_rate_limited": MSG_PROVIDER_RATE_LIMITED,
        "provider_timeout": MSG_PROVIDER_TIMEOUT,
        "provider_error": MSG_PROVIDER_ERROR,
    }
    logger.error(
        "Chat provider error",
        extra={"error_code": error_code, "error": error_text},
    )
    return Message.objects.create(
        conversation=conversation,
        workspace=workspace,
        role=Message.Role.ASSISTANT,
        content="",
        provider_name=getattr(provider, "provider_name", ""),
        model_name=getattr(provider, "_model_name", ""),
        error_message=user_facing_messages.get(error_code, MSG_INTERNAL_ERROR),
    )


def _finalize_conversation(conversation: Conversation, first_user_message: str) -> None:
    updates: dict = {"last_message_at": timezone.now()}
    if conversation.title == DEFAULT_CONVERSATION_TITLE:
        title = first_user_message[:100].strip()
        if title:
            updates["title"] = title
    Conversation.objects.filter(id=conversation.id).update(**updates)
    conversation.refresh_from_db(fields=list(updates.keys()))
