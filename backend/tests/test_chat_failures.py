"""Tests for provider failure handling in the chat pipeline."""
from __future__ import annotations

import json
from typing import Any
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from rest_framework.test import APIClient

from apps.chat.models import Conversation, Message
from apps.chat.retrieval import RetrievedChunk
from apps.providers.llm.exceptions import (
    ProviderAuthError,
    ProviderRateLimitError,
    ProviderTimeoutError,
)


def _chunk():
    return RetrievedChunk(
        chunk_id=uuid4(),
        content="Some content.",
        score=0.9,
        document_id=uuid4(),
        document_filename="doc.pdf",
        page_number=1,
    )


def _parse_sse(raw: bytes) -> list[dict]:
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
    if hasattr(resp, "streaming_content"):
        return b"".join(resp.streaming_content)
    if hasattr(resp, "content"):
        return resp.content
    return b""


def _make_failing_provider(exc: Exception) -> MagicMock:
    mock_provider = MagicMock()
    mock_provider.provider_name = "openai"
    mock_provider._model_name = "gpt-4o-mini"
    mock_provider.stream.side_effect = exc
    return mock_provider


@pytest.mark.django_db
def test_provider_auth_failure_saves_error_message(
    auth_client: APIClient, workspace: Any, user: Any
) -> None:
    conv = Conversation.objects.create(workspace=workspace, created_by=user)
    url = f"/api/v1/workspaces/{workspace.id}/conversations/{conv.id}/messages/"

    with patch("apps.chat.services.retrieve_chunks_for_query", return_value=[_chunk()]), \
         patch("apps.chat.services.get_active_provider") as mock_fn, \
         patch("apps.chat.services.check_and_increment_user_limit"), \
         patch("apps.chat.services.check_and_increment_global_budget"), \
         patch("apps.chat.services._is_using_platform_default", return_value=True):

        mock_fn.return_value = _make_failing_provider(ProviderAuthError("Invalid API key"))
        resp = auth_client.post(url, {"content": "test"}, format="json")
        _consume_sse(resp)

    error_messages = Message.objects.filter(
        conversation=conv,
        role=Message.Role.ASSISTANT,
    ).exclude(error_message="")
    assert error_messages.exists()
    assert "auth_failed" in error_messages.first().error_message


@pytest.mark.django_db
def test_provider_auth_failure_yields_error_event(
    auth_client: APIClient, workspace: Any, user: Any
) -> None:
    conv = Conversation.objects.create(workspace=workspace, created_by=user)
    url = f"/api/v1/workspaces/{workspace.id}/conversations/{conv.id}/messages/"

    with patch("apps.chat.services.retrieve_chunks_for_query", return_value=[_chunk()]), \
         patch("apps.chat.services.get_active_provider") as mock_fn, \
         patch("apps.chat.services.check_and_increment_user_limit"), \
         patch("apps.chat.services.check_and_increment_global_budget"), \
         patch("apps.chat.services._is_using_platform_default", return_value=True):

        mock_fn.return_value = _make_failing_provider(ProviderAuthError("bad key"))
        resp = auth_client.post(url, {"content": "test"}, format="json")
        raw = _consume_sse(resp)

    events = _parse_sse(raw)
    error_events = [e for e in events if e.get("event") == "error"]
    assert len(error_events) >= 1
    assert error_events[0]["data"]["code"] == "provider_auth_failed"


@pytest.mark.django_db
def test_provider_rate_limit_yields_error_event(
    auth_client: APIClient, workspace: Any, user: Any
) -> None:
    conv = Conversation.objects.create(workspace=workspace, created_by=user)
    url = f"/api/v1/workspaces/{workspace.id}/conversations/{conv.id}/messages/"

    with patch("apps.chat.services.retrieve_chunks_for_query", return_value=[_chunk()]), \
         patch("apps.chat.services.get_active_provider") as mock_fn, \
         patch("apps.chat.services.check_and_increment_user_limit"), \
         patch("apps.chat.services.check_and_increment_global_budget"), \
         patch("apps.chat.services._is_using_platform_default", return_value=True):

        mock_fn.return_value = _make_failing_provider(ProviderRateLimitError("Too many requests"))
        resp = auth_client.post(url, {"content": "test"}, format="json")
        raw = _consume_sse(resp)

    events = _parse_sse(raw)
    error_events = [e for e in events if e.get("event") == "error"]
    assert len(error_events) >= 1
    assert error_events[0]["data"]["code"] == "provider_rate_limited"


@pytest.mark.django_db
def test_provider_timeout_yields_error_event(
    auth_client: APIClient, workspace: Any, user: Any
) -> None:
    conv = Conversation.objects.create(workspace=workspace, created_by=user)
    url = f"/api/v1/workspaces/{workspace.id}/conversations/{conv.id}/messages/"

    with patch("apps.chat.services.retrieve_chunks_for_query", return_value=[_chunk()]), \
         patch("apps.chat.services.get_active_provider") as mock_fn, \
         patch("apps.chat.services.check_and_increment_user_limit"), \
         patch("apps.chat.services.check_and_increment_global_budget"), \
         patch("apps.chat.services._is_using_platform_default", return_value=True):

        mock_fn.return_value = _make_failing_provider(ProviderTimeoutError("Request timed out"))
        resp = auth_client.post(url, {"content": "test"}, format="json")
        raw = _consume_sse(resp)

    events = _parse_sse(raw)
    error_events = [e for e in events if e.get("event") == "error"]
    assert len(error_events) >= 1
    assert error_events[0]["data"]["code"] == "provider_timeout"


@pytest.mark.django_db
def test_error_message_persisted_on_provider_rate_limit(
    auth_client: APIClient, workspace: Any, user: Any
) -> None:
    conv = Conversation.objects.create(workspace=workspace, created_by=user)
    url = f"/api/v1/workspaces/{workspace.id}/conversations/{conv.id}/messages/"

    with patch("apps.chat.services.retrieve_chunks_for_query", return_value=[_chunk()]), \
         patch("apps.chat.services.get_active_provider") as mock_fn, \
         patch("apps.chat.services.check_and_increment_user_limit"), \
         patch("apps.chat.services.check_and_increment_global_budget"), \
         patch("apps.chat.services._is_using_platform_default", return_value=True):

        mock_fn.return_value = _make_failing_provider(ProviderRateLimitError("quota exceeded"))
        resp = auth_client.post(url, {"content": "test"}, format="json")
        _consume_sse(resp)

    error_msgs = Message.objects.filter(
        conversation=conv, role=Message.Role.ASSISTANT
    ).exclude(error_message="")
    assert error_msgs.exists()
    assert "provider_rate_limited" in error_msgs.first().error_message
