"""Unit tests for security fixes: auth, SSRF, middleware, rate-limit rollback, email match."""
from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient, APIRequestFactory
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User
from apps.workspaces.models import Membership, Workspace


# ── Auth: Unverified Google email ──────────────────────────────────────────────


@pytest.mark.django_db
def test_google_login_rejects_unverified_email() -> None:
    """Google accounts with email_verified=false must be rejected (403)."""
    client = APIClient()
    fake_profile = {
        "email": "unverified@example.com",
        "email_verified": False,
        "given_name": "No",
        "family_name": "Verify",
    }

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = fake_profile

    with patch("apps.accounts.views.http_requests.get", return_value=mock_resp):
        resp = client.post("/api/v1/auth/google/", {"access_token": "fake"})

    assert resp.status_code == 403
    assert "not verified" in resp.json()["detail"]


@pytest.mark.django_db
def test_google_login_accepts_verified_email() -> None:
    """Google accounts with email_verified=true should succeed."""
    client = APIClient()
    fake_profile = {
        "email": "verified@example.com",
        "email_verified": True,
        "given_name": "Ver",
        "family_name": "Ified",
    }

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = fake_profile

    with patch("apps.accounts.views.http_requests.get", return_value=mock_resp):
        resp = client.post("/api/v1/auth/google/", {"access_token": "fake"})

    assert resp.status_code == 200
    assert "access" in resp.json()
    assert "refresh" in resp.json()


# ── SSRF: Provider base_url validation ─────────────────────────────────────────


@pytest.mark.django_db
@pytest.mark.parametrize("bad_url", [
    "http://localhost/api",
    "http://127.0.0.1/api",
    "http://0.0.0.0/api",
    "http://metadata.google.internal/computeMetadata/v1",
    "http://10.0.0.1/api",
    "http://192.168.1.1/api",
    "http://172.16.0.1/api",
])
def test_provider_ssrf_blocks_private_urls(auth_client: APIClient, workspace: Any, bad_url: str) -> None:
    resp = auth_client.put(
        f"/api/v1/workspaces/{workspace.id}/provider/",
        {"provider_name": "openai", "api_key": "sk-test", "model_name": "gpt-4o", "base_url": bad_url},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_provider_allows_public_base_url(auth_client: APIClient, workspace: Any) -> None:
    resp = auth_client.put(
        f"/api/v1/workspaces/{workspace.id}/provider/",
        {"provider_name": "openai", "api_key": "sk-test", "model_name": "gpt-4o", "base_url": "https://api.openai.com/v1"},
        format="json",
    )
    assert resp.status_code == 200


# ── Middleware: Security headers ───────────────────────────────────────────────


@pytest.mark.django_db
def test_security_headers_present() -> None:
    client = APIClient()
    resp = client.get("/api/health/")
    assert "Content-Security-Policy" in resp
    assert "Referrer-Policy" in resp
    assert "Permissions-Policy" in resp
    assert "X-Request-ID" in resp


@pytest.mark.django_db
def test_security_headers_csp_content() -> None:
    client = APIClient()
    resp = client.get("/api/health/")
    csp = resp["Content-Security-Policy"]
    assert "default-src 'self'" in csp
    assert "object-src 'none'" in csp


# ── Chat limits: Decrement on failure ──────────────────────────────────────────


def test_decrement_user_limit_reduces_count(db: Any) -> None:
    from apps.chat.limits import (
        check_and_increment_user_limit,
        decrement_user_limit,
        get_user_workspace_usage_today,
    )

    user_id = uuid4()
    ws_id = uuid4()
    cache.clear()

    with patch("apps.chat.limits.settings") as s:
        s.USER_DAILY_MESSAGE_LIMIT = 100
        check_and_increment_user_limit(user_id, ws_id)
        check_and_increment_user_limit(user_id, ws_id)
        assert get_user_workspace_usage_today(user_id, ws_id) == 2

    decrement_user_limit(user_id, ws_id)
    assert get_user_workspace_usage_today(user_id, ws_id) == 1


def test_decrement_global_budget_reduces_count(db: Any) -> None:
    from apps.chat.limits import (
        check_and_increment_global_budget,
        decrement_global_budget,
        get_remaining_global_budget,
    )

    cache.clear()
    with patch("apps.chat.limits.settings") as s:
        s.GLOBAL_DAILY_PLATFORM_LLM_BUDGET = 100
        check_and_increment_global_budget()
        check_and_increment_global_budget()

    with patch("apps.chat.limits.settings") as s:
        s.GLOBAL_DAILY_PLATFORM_LLM_BUDGET = 100
        remaining_before = get_remaining_global_budget()

    decrement_global_budget()

    with patch("apps.chat.limits.settings") as s:
        s.GLOBAL_DAILY_PLATFORM_LLM_BUDGET = 100
        remaining_after = get_remaining_global_budget()

    assert remaining_after == remaining_before + 1


def test_decrement_user_limit_noop_when_zero(db: Any) -> None:
    """Decrementing when counter doesn't exist should not raise."""
    from apps.chat.limits import decrement_user_limit

    cache.clear()
    decrement_user_limit(uuid4(), uuid4())  # should not raise


@pytest.mark.django_db
def test_record_failed_attempt_creates_usage_with_zero_messages() -> None:
    from apps.chat.limits import record_failed_attempt
    from apps.chat.models import UsageRecord

    user = User.objects.create_user(email="failuser@example.com")
    ws = Workspace.objects.filter(memberships__user=user).first()
    assert ws is not None

    record_failed_attempt(ws.id, user.id)

    record = UsageRecord.objects.get(workspace=ws, user=user)
    assert record.message_count == 0
    assert record.token_input_count == 0


# ── Invitation: Email mismatch ────────────────────────────────────────────────


@pytest.mark.django_db
def test_invitation_email_mismatch_blocked() -> None:
    """Accepting an invite meant for a different email must be rejected."""
    admin = User.objects.create_user(email="sec_admin@example.com", first_name="Admin")
    wrong_user = User.objects.create_user(email="wrong@example.com", first_name="Wrong")

    from apps.workspaces.services import create_workspace

    ws = create_workspace(name="Sec Workspace", user=admin)

    admin_client = APIClient()
    admin_client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {str(RefreshToken.for_user(admin).access_token)}"
    )

    with patch("apps.core.email.send_invitation_email"):
        create_resp = admin_client.post(
            f"/api/v1/workspaces/{ws.id}/invitations/",
            {"email": "target@example.com", "role": "member"},
        )
    assert create_resp.status_code == 201
    token = create_resp.json()["token"]

    wrong_client = APIClient()
    wrong_client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {str(RefreshToken.for_user(wrong_user).access_token)}"
    )

    accept_resp = wrong_client.post(f"/api/v1/invitations/{token}/accept/")
    assert accept_resp.status_code == 403
