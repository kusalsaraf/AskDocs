from typing import Any

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def user(db: Any) -> Any:
    from apps.accounts.models import User

    return User.objects.create_user(
        email="testuser@example.com", first_name="Test", last_name="User"
    )


@pytest.fixture
def other_user(db: Any) -> Any:
    from apps.accounts.models import User

    return User.objects.create_user(
        email="other@example.com", first_name="Other", last_name="User"
    )


@pytest.fixture
def auth_client(user: Any) -> APIClient:
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


@pytest.fixture
def other_auth_client(other_user: Any) -> APIClient:
    client = APIClient()
    refresh = RefreshToken.for_user(other_user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


@pytest.fixture
def workspace(user: Any) -> Any:
    from apps.workspaces.services import create_workspace

    return create_workspace(name="Test Workspace", user=user)
