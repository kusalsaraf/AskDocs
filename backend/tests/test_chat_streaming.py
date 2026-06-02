"""Tests for the SSE streaming chat endpoint."""
from __future__ import annotations

import json
from typing import Any
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from rest_framework.test import APIClient

from apps.chat.models import Conversation, Message
from apps.chat.retrieval import RetrievedChunk


def _make_retrieved_chunk(filename="doc.pdf"):
    return RetrievedChunk(
        chunk_id=uuid4(),
        content="Some document content.",
        score=0.9,
        document_id=uuid4(),
        document_filename=filename,
        page_number=1,
    )


def _parse_sse(raw: bytes) -> list[dict]:
    """Parse SSE response into list of {event, data} dicts."""
    events = []
    current: dict = {}
    for line in raw.decode().splitlines():
        if line.startswith("event:"):
            current["event"] = line[len("event:"):].strip()
        elif line.startswith("data:"):
            current["data"] = json.loads(line[len("data:"):].strip())
        elif line == "" and current:
            events.append(current)
            current = {}
    if current:
        events.append(current)
    return events


def _consume_sse(resp) -> bytes:
    """Consume a StreamingHttpResponse and return raw bytes."""
    if hasattr(resp, "streaming_content"):
        return b"".join(resp.streaming_content)
    if hasattr(resp, "content"):
        return resp.content
    return b""


@pytest.mark.django_db
def test_stream_chat_yields_token_and_complete(
    auth_client: APIClient, workspace: Any, user: Any
) -> None:
    conv = Conversation.objects.create(workspace=workspace, created_by=user)
    url = f"/api/v1/workspaces/{workspace.id}/conversations/{conv.id}/messages/"

    chunks = [_make_retrieved_chunk()]

    from apps.providers.llm.base import StreamChunk

    mock_stream = [
        StreamChunk(delta="Hello "),
        StreamChunk(delta="world"),
        StreamChunk(delta="", finish_reason="stop"),
    ]

    with patch("apps.chat.services.retrieve_chunks_for_query", return_value=chunks), \
         patch("apps.chat.services.get_active_provider") as mock_provider_fn, \
         patch("apps.chat.services.check_and_increment_user_limit"), \
         patch("apps.chat.services.check_and_increment_global_budget"), \
         patch("apps.chat.services._is_using_platform_default", return_value=True):

        mock_provider = MagicMock()
        mock_provider.provider_name = "openai"
        mock_provider._model_name = "gpt-4o-mini"
        mock_provider.stream.return_value = iter(mock_stream)
        mock_provider_fn.return_value = mock_provider

        resp = auth_client.post(url, {"content": "What is the policy?"}, format="json")
        # Consume streaming content while patches are still active
        raw = _consume_sse(resp)

    assert resp.status_code == 200
    assert resp["Content-Type"] == "text/event-stream"

    events = _parse_sse(raw)
    token_events = [e for e in events if e.get("event") == "token"]
    complete_events = [e for e in events if e.get("event") == "complete"]

    assert len(token_events) >= 2
    assert len(complete_events) == 1
    assert "message_id" in complete_events[0]["data"]
    assert "citations" in complete_events[0]["data"]


@pytest.mark.django_db
def test_assistant_message_persisted(auth_client: APIClient, workspace: Any, user: Any) -> None:
    conv = Conversation.objects.create(workspace=workspace, created_by=user)
    url = f"/api/v1/workspaces/{workspace.id}/conversations/{conv.id}/messages/"

    chunk = _make_retrieved_chunk()

    from apps.providers.llm.base import StreamChunk

    mock_stream = [
        StreamChunk(delta="The answer is [1]."),
        StreamChunk(delta="", finish_reason="stop"),
    ]

    with patch("apps.chat.services.retrieve_chunks_for_query", return_value=[chunk]), \
         patch("apps.chat.services.get_active_provider") as mock_provider_fn, \
         patch("apps.chat.services.check_and_increment_user_limit"), \
         patch("apps.chat.services.check_and_increment_global_budget"), \
         patch("apps.chat.services._is_using_platform_default", return_value=True):

        mock_provider = MagicMock()
        mock_provider.provider_name = "openai"
        mock_provider._model_name = "gpt-4o-mini"
        mock_provider.stream.return_value = iter(mock_stream)
        mock_provider_fn.return_value = mock_provider

        resp = auth_client.post(url, {"content": "What is the answer?"}, format="json")
        _consume_sse(resp)  # consume stream while patches are active

    assert resp.status_code == 200

    assistant_msgs = Message.objects.filter(conversation=conv, role=Message.Role.ASSISTANT)
    assert assistant_msgs.exists()
    msg = assistant_msgs.first()
    assert "The answer is" in msg.content
    assert len(msg.retrieved_chunks) == 1
    assert msg.citations[0]["index"] == 1


@pytest.mark.django_db
def test_cache_hit_returns_is_cached_true(
    auth_client: APIClient, workspace: Any, user: Any
) -> None:
    from apps.chat.cache import CachedResponse, cache_key_for_query, cache_response

    conv = Conversation.objects.create(workspace=workspace, created_by=user)
    url = f"/api/v1/workspaces/{workspace.id}/conversations/{conv.id}/messages/"
    query = "cached question"
    chunk = _make_retrieved_chunk()

    # Pre-populate the cache
    key = cache_key_for_query(workspace.id, [chunk.chunk_id], query)
    cached = CachedResponse(
        full_text="Cached answer [1].",
        citations={1: str(chunk.chunk_id)},
        provider_name="openai",
        model_name="gpt-4o-mini",
        prompt_tokens=10,
        completion_tokens=5,
    )
    cache_response(key, cached)

    with patch("apps.chat.services.retrieve_chunks_for_query", return_value=[chunk]), \
         patch("apps.chat.services.check_and_increment_user_limit"), \
         patch("apps.chat.services.check_and_increment_global_budget"), \
         patch("apps.chat.services._is_using_platform_default", return_value=True), \
         patch("apps.chat.services.get_active_provider") as mock_provider_fn:

        resp = auth_client.post(url, {"content": query}, format="json")
        raw = _consume_sse(resp)

    events = _parse_sse(raw)
    complete_events = [e for e in events if e.get("event") == "complete"]
    assert complete_events[0]["data"]["is_cached"] is True
    # Provider should NOT have been called on cache hit
    mock_provider_fn.assert_not_called()


@pytest.mark.django_db
def test_viewer_cannot_send_message(
    viewer_auth_client: APIClient, workspace: Any, user: Any
) -> None:
    conv = Conversation.objects.create(workspace=workspace, created_by=user)
    url = f"/api/v1/workspaces/{workspace.id}/conversations/{conv.id}/messages/"
    resp = viewer_auth_client.post(url, {"content": "Hello"}, format="json")
    assert resp.status_code == 403


@pytest.mark.django_db
def test_empty_message_rejected(auth_client: APIClient, workspace: Any, user: Any) -> None:
    conv = Conversation.objects.create(workspace=workspace, created_by=user)
    url = f"/api/v1/workspaces/{workspace.id}/conversations/{conv.id}/messages/"
    resp = auth_client.post(url, {"content": "   "}, format="json")
    assert resp.status_code == 400
