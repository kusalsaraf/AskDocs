from typing import Any

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken


@pytest.fixture(autouse=True)
def clear_cache() -> Any:
    """Clear Django cache before and after every test.
    Ensures rate-limit counters don't leak between tests when using LocMemCache.
    """
    from django.core.cache import cache

    cache.clear()
    yield
    cache.clear()


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


@pytest.fixture
def member_auth_client(db: Any, workspace: Any, other_user: Any) -> APIClient:
    """Authenticated client whose user is a MEMBER of `workspace`."""
    from apps.workspaces.models import Membership

    Membership.objects.create(
        workspace=workspace, user=other_user, role=Membership.Role.MEMBER
    )
    client = APIClient()
    refresh = RefreshToken.for_user(other_user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


@pytest.fixture
def viewer_auth_client(db: Any, workspace: Any) -> APIClient:
    """Authenticated client whose user is a VIEWER of `workspace`."""
    from apps.accounts.models import User
    from apps.workspaces.models import Membership

    viewer = User.objects.create_user(email="viewer@example.com", first_name="Viewer")
    Membership.objects.create(workspace=workspace, user=viewer, role=Membership.Role.VIEWER)
    client = APIClient()
    refresh = RefreshToken.for_user(viewer)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client
