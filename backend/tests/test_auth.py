import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User
from apps.workspaces.models import Membership, Workspace


@pytest.mark.django_db
def test_me_requires_authentication() -> None:
    client = APIClient()
    response = client.get("/api/v1/me/")
    assert response.status_code == 401


@pytest.mark.django_db
def test_me_returns_user_and_workspaces() -> None:
    user = User.objects.create_user(
        email="me@example.com", first_name="Me", last_name="Test"
    )
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")

    response = client.get("/api/v1/me/")
    assert response.status_code == 200
    data = response.json()

    assert data["email"] == "me@example.com"
    assert data["first_name"] == "Me"
    assert len(data["workspaces"]) == 1
    assert data["workspaces"][0]["is_personal"] is True
    assert data["workspaces"][0]["role"] == Membership.Role.ADMIN


@pytest.mark.django_db
def test_creating_user_auto_creates_personal_workspace_as_admin() -> None:
    user = User.objects.create_user(email="signal@example.com", first_name="Signal")
    assert Workspace.objects.filter(memberships__user=user).count() == 1
    membership = Membership.objects.get(user=user)
    assert membership.role == Membership.Role.ADMIN
    assert membership.workspace.is_personal is True


@pytest.mark.django_db
def test_jwt_refresh_flow() -> None:
    user = User.objects.create_user(email="refresh@example.com")
    refresh = RefreshToken.for_user(user)

    client = APIClient()
    response = client.post("/api/v1/auth/token/refresh/", {"refresh": str(refresh)})
    assert response.status_code == 200
    assert "access" in response.json()
