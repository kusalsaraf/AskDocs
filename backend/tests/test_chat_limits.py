"""Tests for per-user daily limit and global platform budget."""
from __future__ import annotations

from typing import Any
from unittest.mock import patch
from uuid import uuid4

import pytest
from django.core.cache import cache

from apps.chat.exceptions import BudgetExceeded, RateLimitExceeded
from apps.chat.limits import (
    check_and_increment_global_budget,
    check_and_increment_user_limit,
    get_remaining_global_budget,
    get_user_workspace_usage_today,
)


@pytest.fixture(autouse=True)
def _clear(db: Any) -> Any:
    cache.clear()
    yield
    cache.clear()


# ── Per-user limit ────────────────────────────────────────────────────────────

def test_user_limit_allows_up_to_limit() -> None:
    user_id = uuid4()
    ws_id = uuid4()
    with patch("apps.chat.limits.settings") as s:
        s.USER_DAILY_MESSAGE_LIMIT = 3
        s.GLOBAL_DAILY_PLATFORM_LLM_BUDGET = 5000
        for _ in range(3):
            check_and_increment_user_limit(user_id, ws_id)
        assert get_user_workspace_usage_today(user_id, ws_id) == 3


def test_user_limit_raises_on_exceed() -> None:
    user_id = uuid4()
    ws_id = uuid4()
    with patch("apps.chat.limits.settings") as s:
        s.USER_DAILY_MESSAGE_LIMIT = 2
        s.GLOBAL_DAILY_PLATFORM_LLM_BUDGET = 5000
        check_and_increment_user_limit(user_id, ws_id)
        check_and_increment_user_limit(user_id, ws_id)
        with pytest.raises(RateLimitExceeded):
            check_and_increment_user_limit(user_id, ws_id)


def test_user_limit_100_messages() -> None:
    user_id = uuid4()
    ws_id = uuid4()
    with patch("apps.chat.limits.settings") as s:
        s.USER_DAILY_MESSAGE_LIMIT = 100
        s.GLOBAL_DAILY_PLATFORM_LLM_BUDGET = 5000
        for _ in range(100):
            check_and_increment_user_limit(user_id, ws_id)
        with pytest.raises(RateLimitExceeded):
            check_and_increment_user_limit(user_id, ws_id)


def test_remaining_quota_decreases() -> None:
    user_id = uuid4()
    ws_id = uuid4()
    with patch("apps.chat.limits.settings") as s:
        s.USER_DAILY_MESSAGE_LIMIT = 10
        s.GLOBAL_DAILY_PLATFORM_LLM_BUDGET = 5000
        assert get_user_workspace_usage_today(user_id, ws_id) == 0
        check_and_increment_user_limit(user_id, ws_id)
        assert get_user_workspace_usage_today(user_id, ws_id) == 1


def test_different_users_have_independent_limits() -> None:
    user_a = uuid4()
    user_b = uuid4()
    ws_id = uuid4()
    with patch("apps.chat.limits.settings") as s:
        s.USER_DAILY_MESSAGE_LIMIT = 2
        s.GLOBAL_DAILY_PLATFORM_LLM_BUDGET = 5000
        check_and_increment_user_limit(user_a, ws_id)
        check_and_increment_user_limit(user_a, ws_id)
        with pytest.raises(RateLimitExceeded):
            check_and_increment_user_limit(user_a, ws_id)
        check_and_increment_user_limit(user_b, ws_id)  # should not raise


# ── Global budget ─────────────────────────────────────────────────────────────

def test_global_budget_allows_up_to_limit() -> None:
    with patch("apps.chat.limits.settings") as s:
        s.USER_DAILY_MESSAGE_LIMIT = 100
        s.GLOBAL_DAILY_PLATFORM_LLM_BUDGET = 3
        for _ in range(3):
            check_and_increment_global_budget()
        assert get_remaining_global_budget() == 0


def test_global_budget_raises_on_exceed() -> None:
    with patch("apps.chat.limits.settings") as s:
        s.USER_DAILY_MESSAGE_LIMIT = 100
        s.GLOBAL_DAILY_PLATFORM_LLM_BUDGET = 2
        check_and_increment_global_budget()
        check_and_increment_global_budget()
        with pytest.raises(BudgetExceeded):
            check_and_increment_global_budget()


@pytest.mark.django_db
def test_byok_workspace_not_subject_to_global_budget(workspace: Any, user: Any) -> None:
    """BYOK workspaces skip global budget check — only user limit applies."""
    from apps.chat.models import Conversation
    from apps.chat.retrieval import RetrievedChunk
    from apps.providers.llm.base import StreamChunk
    from apps.providers.models import ProviderConfig

    ProviderConfig.objects.create(
        workspace=workspace,
        provider_name="openai",
        model_name="gpt-4o",
        encrypted_api_key=b"x" * 44,
        api_key_last_4="1234",
        created_by=user,
    )

    conv = Conversation.objects.create(workspace=workspace, created_by=user)
    url = f"/api/v1/workspaces/{workspace.id}/conversations/{conv.id}/messages/"

    chunk = RetrievedChunk(
        chunk_id=__import__("uuid").uuid4(),
        content="content",
        score=0.9,
        document_id=__import__("uuid").uuid4(),
        document_filename="f.pdf",
        page_number=1,
    )

    from rest_framework.test import APIClient
    from rest_framework_simplejwt.tokens import RefreshToken

    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")

    mock_stream = [StreamChunk(delta="ok"), StreamChunk(delta="", finish_reason="stop")]

    with patch("apps.chat.limits.settings") as s:
        s.USER_DAILY_MESSAGE_LIMIT = 100
        s.GLOBAL_DAILY_PLATFORM_LLM_BUDGET = 0
        with patch("apps.chat.services.retrieve_chunks_for_query", return_value=[chunk]), \
             patch("apps.chat.services.get_active_provider") as mock_provider_fn, \
             patch("apps.chat.services.check_and_increment_user_limit"):

            from unittest.mock import MagicMock
            mock_provider = MagicMock()
            mock_provider.provider_name = "openai"
            mock_provider._model_name = "gpt-4o"
            mock_provider.stream.return_value = iter(mock_stream)
            mock_provider_fn.return_value = mock_provider

            resp = client.post(url, {"content": "Hello"}, format="json")

    assert resp.status_code == 200
