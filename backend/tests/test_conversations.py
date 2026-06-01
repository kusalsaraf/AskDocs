"""Tests for conversation CRUD, auth, and workspace isolation."""
from __future__ import annotations

from typing import Any

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.chat.models import Conversation
from apps.workspaces.models import Membership


@pytest.fixture
def conv_url(workspace: Any) -> str:
    return f"/api/v1/workspaces/{workspace.id}/conversations/"


@pytest.fixture
def other_workspace(other_user: Any) -> Any:
    from apps.workspaces.services import create_workspace

    return create_workspace(name="Other Workspace", user=other_user)


# ── Create ────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_create_conversation_admin(auth_client: APIClient, conv_url: str) -> None:
    resp = auth_client.post(conv_url, {})
    assert resp.status_code == 201
    assert resp.data["title"] == "New conversation"


@pytest.mark.django_db
def test_create_conversation_member(member_auth_client: APIClient, workspace: Any) -> None:
    url = f"/api/v1/workspaces/{workspace.id}/conversations/"
    resp = member_auth_client.post(url, {})
    assert resp.status_code == 201


@pytest.mark.django_db
def test_create_conversation_viewer_forbidden(
    viewer_auth_client: APIClient, workspace: Any
) -> None:
    url = f"/api/v1/workspaces/{workspace.id}/conversations/"
    resp = viewer_auth_client.post(url, {})
    assert resp.status_code == 403


@pytest.mark.django_db
def test_create_conversation_unauthenticated(api_client: APIClient, conv_url: str) -> None:
    resp = api_client.post(conv_url, {})
    assert resp.status_code == 401


@pytest.mark.django_db
def test_create_conversation_custom_title(auth_client: APIClient, conv_url: str) -> None:
    resp = auth_client.post(conv_url, {"title": "My Chat"})
    assert resp.status_code == 201
    assert resp.data["title"] == "My Chat"


# ── List ─────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_list_admin_sees_all(auth_client: APIClient, workspace: Any, other_user: Any) -> None:
    """Admin can see all conversations in the workspace."""
    Membership.objects.get_or_create(
        workspace=workspace, user=other_user, defaults={"role": Membership.Role.MEMBER}
    )
    Conversation.objects.create(workspace=workspace, created_by=workspace.created_by, title="A")
    Conversation.objects.create(workspace=workspace, created_by=other_user, title="B")

    url = f"/api/v1/workspaces/{workspace.id}/conversations/"
    resp = auth_client.get(url)
    assert resp.status_code == 200
    titles = [c["title"] for c in resp.data["results"]]
    assert "A" in titles
    assert "B" in titles


@pytest.mark.django_db
def test_list_member_sees_own_only(workspace: Any, other_user: Any) -> None:
    """Member sees only their own conversations."""
    Membership.objects.get_or_create(
        workspace=workspace, user=other_user, defaults={"role": Membership.Role.MEMBER}
    )
    admin_user = workspace.created_by
    Conversation.objects.create(workspace=workspace, created_by=admin_user, title="Admin conv")
    Conversation.objects.create(workspace=workspace, created_by=other_user, title="Member conv")

    client = APIClient()
    refresh = RefreshToken.for_user(other_user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")

    url = f"/api/v1/workspaces/{workspace.id}/conversations/"
    resp = client.get(url)
    assert resp.status_code == 200
    titles = [c["title"] for c in resp.data["results"]]
    assert "Member conv" in titles
    assert "Admin conv" not in titles


# ── Update ────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_update_title_and_pin(auth_client: APIClient, workspace: Any, user: Any) -> None:
    conv = Conversation.objects.create(workspace=workspace, created_by=user)
    url = f"/api/v1/workspaces/{workspace.id}/conversations/{conv.id}/"
    resp = auth_client.patch(url, {"title": "Updated", "is_pinned": True})
    assert resp.status_code == 200
    assert resp.data["title"] == "Updated"
    assert resp.data["is_pinned"] is True


@pytest.mark.django_db
def test_member_cannot_update_others_conversation(
    workspace: Any, user: Any, other_user: Any
) -> None:
    Membership.objects.get_or_create(
        workspace=workspace, user=other_user, defaults={"role": Membership.Role.MEMBER}
    )
    conv = Conversation.objects.create(workspace=workspace, created_by=user)

    client = APIClient()
    refresh = RefreshToken.for_user(other_user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")

    url = f"/api/v1/workspaces/{workspace.id}/conversations/{conv.id}/"
    resp = client.patch(url, {"title": "Hijacked"})
    assert resp.status_code == 404


# ── Delete ────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_delete_conversation(auth_client: APIClient, workspace: Any, user: Any) -> None:
    conv = Conversation.objects.create(workspace=workspace, created_by=user)
    url = f"/api/v1/workspaces/{workspace.id}/conversations/{conv.id}/"
    resp = auth_client.delete(url)
    assert resp.status_code == 204
    assert not Conversation.objects.filter(id=conv.id).exists()


# ── Cross-workspace isolation ─────────────────────────────────────────────────

@pytest.mark.django_db
def test_cross_workspace_isolation(
    auth_client: APIClient, workspace: Any, other_workspace: Any, user: Any
) -> None:
    """User cannot access a conversation in a workspace they don't belong to."""
    conv = Conversation.objects.create(
        workspace=other_workspace, created_by=other_workspace.created_by
    )
    url = f"/api/v1/workspaces/{other_workspace.id}/conversations/{conv.id}/"
    resp = auth_client.get(url)
    # Should be 403 (not a member of other_workspace)
    assert resp.status_code == 403
