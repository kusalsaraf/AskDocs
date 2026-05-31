from typing import Any

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User
from apps.workspaces.models import Membership, Workspace


@pytest.fixture
def admin_user(db: Any) -> User:
    return User.objects.create_user(email="inv_admin@example.com", first_name="Admin")


@pytest.fixture
def member_user(db: Any) -> User:
    return User.objects.create_user(email="inv_member@example.com", first_name="Member")


@pytest.fixture
def invitee_user(db: Any) -> User:
    return User.objects.create_user(email="invitee@example.com", first_name="Invitee")


@pytest.fixture
def workspace_with_member(admin_user: User, member_user: User) -> Workspace:
    from apps.workspaces.services import create_workspace

    ws = create_workspace(name="Team Workspace", user=admin_user)
    Membership.objects.create(workspace=ws, user=member_user, role=Membership.Role.MEMBER)
    return ws


@pytest.fixture
def admin_client(admin_user: User) -> APIClient:
    client = APIClient()
    refresh = RefreshToken.for_user(admin_user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


@pytest.fixture
def member_client(member_user: User) -> APIClient:
    client = APIClient()
    refresh = RefreshToken.for_user(member_user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


@pytest.fixture
def invitee_client(invitee_user: User) -> APIClient:
    client = APIClient()
    refresh = RefreshToken.for_user(invitee_user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


@pytest.mark.django_db
def test_admin_can_create_invitation(
    admin_client: APIClient, workspace_with_member: Workspace
) -> None:
    response = admin_client.post(
        f"/api/v1/workspaces/{workspace_with_member.id}/invitations/",
        {"email": "newperson@example.com", "role": "MEMBER"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "newperson@example.com"
    assert "token" in data


@pytest.mark.django_db
def test_member_cannot_create_invitation(
    member_client: APIClient, workspace_with_member: Workspace
) -> None:
    response = member_client.post(
        f"/api/v1/workspaces/{workspace_with_member.id}/invitations/",
        {"email": "someone@example.com", "role": "MEMBER"},
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_invitee_can_accept_invitation(
    admin_client: APIClient,
    invitee_client: APIClient,
    invitee_user: User,
    workspace_with_member: Workspace,
) -> None:
    create_resp = admin_client.post(
        f"/api/v1/workspaces/{workspace_with_member.id}/invitations/",
        {"email": "invitee@example.com", "role": "MEMBER"},
    )
    assert create_resp.status_code == 201
    token = create_resp.json()["token"]

    accept_resp = invitee_client.post(f"/api/v1/invitations/{token}/accept/")
    assert accept_resp.status_code == 200

    assert Membership.objects.filter(
        workspace=workspace_with_member, user=invitee_user
    ).exists()


@pytest.mark.django_db
def test_accepting_already_accepted_invitation_fails(
    admin_client: APIClient,
    invitee_client: APIClient,
    workspace_with_member: Workspace,
) -> None:
    create_resp = admin_client.post(
        f"/api/v1/workspaces/{workspace_with_member.id}/invitations/",
        {"email": "invitee@example.com", "role": "MEMBER"},
    )
    assert create_resp.status_code == 201
    token = create_resp.json()["token"]

    invitee_client.post(f"/api/v1/invitations/{token}/accept/")
    second_resp = invitee_client.post(f"/api/v1/invitations/{token}/accept/")
    assert second_resp.status_code == 400
    assert second_resp.json()["error"]["code"] == "invitation_already_accepted"
