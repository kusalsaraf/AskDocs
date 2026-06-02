from typing import Any

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User
from apps.workspaces.models import Membership, Workspace

# ── Signal / service tests ────────────────────────────────────────────────────

@pytest.mark.django_db
def test_personal_workspace_created_on_user_registration() -> None:
    user = User.objects.create_user(email="alice@example.com", first_name="Alice")
    workspaces = Workspace.objects.filter(memberships__user=user)
    assert workspaces.count() == 1
    ws = workspaces.first()
    assert ws is not None
    assert ws.name == "Alice's Workspace"
    assert ws.is_personal is True


@pytest.mark.django_db
def test_personal_workspace_name_uses_email_prefix_when_no_first_name() -> None:
    user = User.objects.create_user(email="bob@example.com")
    ws = Workspace.objects.filter(memberships__user=user).first()
    assert ws is not None
    assert ws.name == "bob's Workspace"


@pytest.mark.django_db
def test_personal_workspace_creator_is_admin() -> None:
    user = User.objects.create_user(email="carol@example.com", first_name="Carol")
    membership = Membership.objects.get(user=user)
    assert membership.role == Membership.Role.ADMIN


@pytest.mark.django_db
def test_workspace_slug_is_unique_and_slugified() -> None:
    user = User.objects.create_user(email="dave@example.com", first_name="Dave")
    ws = Workspace.objects.filter(memberships__user=user).first()
    assert ws is not None
    assert ws.slug != ""
    assert " " not in ws.slug


# ── Workspace CRUD + multi-tenancy tests ──────────────────────────────────────

@pytest.mark.django_db
def test_list_workspaces_returns_only_users_workspaces(
    auth_client: APIClient, user: Any, other_user: Any
) -> None:
    response = auth_client.get("/api/v1/workspaces/")
    assert response.status_code == 200
    data = response.json()
    ids = [w["id"] for w in data["results"]]
    user_ws_ids = list(
        Workspace.objects.filter(memberships__user=user).values_list("id", flat=True)
    )
    for ws_id in user_ws_ids:
        assert str(ws_id) in ids


@pytest.mark.django_db
def test_other_users_workspace_not_in_list(
    auth_client: APIClient, other_user: Any
) -> None:
    response = auth_client.get("/api/v1/workspaces/")
    assert response.status_code == 200
    data = response.json()
    ids = [w["id"] for w in data["results"]]
    other_ws = Workspace.objects.filter(memberships__user=other_user).first()
    assert other_ws is not None
    assert str(other_ws.id) not in ids


@pytest.mark.django_db
def test_create_workspace(auth_client: APIClient, user: Any) -> None:
    response = auth_client.post("/api/v1/workspaces/", {"name": "My New Workspace"})
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "My New Workspace"
    assert Workspace.objects.filter(id=data["id"]).exists()


@pytest.mark.django_db
def test_non_member_cannot_retrieve_workspace(
    other_auth_client: APIClient, user: Any
) -> None:
    ws = Workspace.objects.filter(memberships__user=user).first()
    assert ws is not None
    response = other_auth_client.get(f"/api/v1/workspaces/{ws.id}/")
    assert response.status_code == 403


@pytest.mark.django_db
def test_non_member_cannot_update_workspace(
    other_auth_client: APIClient, user: Any
) -> None:
    ws = Workspace.objects.filter(memberships__user=user).first()
    assert ws is not None
    response = other_auth_client.patch(f"/api/v1/workspaces/{ws.id}/", {"name": "Hacked"})
    assert response.status_code == 403


@pytest.mark.django_db
def test_cannot_delete_personal_workspace(auth_client: APIClient, user: Any) -> None:
    ws = Workspace.objects.filter(memberships__user=user, is_personal=True).first()
    assert ws is not None
    response = auth_client.delete(f"/api/v1/workspaces/{ws.id}/")
    assert response.status_code == 400


@pytest.mark.django_db
def test_admin_can_delete_non_personal_workspace(
    auth_client: APIClient, user: Any
) -> None:
    from apps.workspaces.services import create_workspace

    ws = create_workspace(name="Deletable", user=user)
    response = auth_client.delete(f"/api/v1/workspaces/{ws.id}/")
    assert response.status_code == 204


# ── Member management tests ───────────────────────────────────────────────────

@pytest.mark.django_db
def test_member_cannot_change_roles(
    auth_client: APIClient, user: Any, other_user: Any
) -> None:
    from apps.workspaces.services import create_workspace

    ws = create_workspace(name="Role Test", user=user)
    Membership.objects.create(workspace=ws, user=other_user, role=Membership.Role.MEMBER)

    member_client = APIClient()
    refresh = RefreshToken.for_user(other_user)
    member_client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    response = member_client.patch(
        f"/api/v1/workspaces/{ws.id}/members/{user.id}/",
        {"role": "viewer"},
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_sole_admin_cannot_be_demoted(auth_client: APIClient, user: Any) -> None:
    from apps.workspaces.services import create_workspace

    ws = create_workspace(name="Sole Admin Test", user=user)
    response = auth_client.patch(
        f"/api/v1/workspaces/{ws.id}/members/{user.id}/",
        {"role": "member"},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "cannot_remove_sole_admin"


@pytest.mark.django_db
def test_sole_admin_cannot_be_removed(auth_client: APIClient, user: Any) -> None:
    from apps.workspaces.services import create_workspace

    ws = create_workspace(name="Remove Admin Test", user=user)
    response = auth_client.delete(f"/api/v1/workspaces/{ws.id}/members/{user.id}/")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "cannot_remove_sole_admin"
