from unittest.mock import MagicMock

import pytest
from rest_framework.test import APIRequestFactory

from apps.accounts.models import User
from apps.core.permissions import IsWorkspaceAdmin, IsWorkspaceMember, IsWorkspaceMemberOrAdmin
from apps.workspaces.models import Membership, Workspace


@pytest.fixture
def factory() -> APIRequestFactory:
    return APIRequestFactory()


@pytest.mark.django_db
def test_is_workspace_member_allows_member(factory: APIRequestFactory) -> None:
    user = User.objects.create_user(email="perm_m@example.com")
    ws = Workspace.objects.filter(memberships__user=user).first()
    assert ws is not None

    request = factory.get("/")
    request.user = user  # type: ignore[attr-defined]

    view = MagicMock()
    view.kwargs = {"pk": str(ws.id)}

    perm = IsWorkspaceMember()
    assert perm.has_permission(request, view) is True  # type: ignore[arg-type]


@pytest.mark.django_db
def test_is_workspace_member_blocks_non_member(factory: APIRequestFactory) -> None:
    user = User.objects.create_user(email="perm_member2@example.com")
    outsider = User.objects.create_user(email="perm_outsider@example.com")
    ws = Workspace.objects.filter(memberships__user=user).first()
    assert ws is not None

    request = factory.get("/")
    request.user = outsider  # type: ignore[attr-defined]

    view = MagicMock()
    view.kwargs = {"pk": str(ws.id)}

    perm = IsWorkspaceMember()
    assert perm.has_permission(request, view) is False  # type: ignore[arg-type]


@pytest.mark.django_db
def test_is_workspace_admin_allows_admin(factory: APIRequestFactory) -> None:
    user = User.objects.create_user(email="perm_admin@example.com")
    ws = Workspace.objects.filter(memberships__user=user).first()
    assert ws is not None

    request = factory.get("/")
    request.user = user  # type: ignore[attr-defined]

    view = MagicMock()
    view.kwargs = {"pk": str(ws.id)}

    perm = IsWorkspaceAdmin()
    assert perm.has_permission(request, view) is True  # type: ignore[arg-type]


@pytest.mark.django_db
def test_is_workspace_admin_blocks_member(factory: APIRequestFactory) -> None:
    admin = User.objects.create_user(email="perm_admin2@example.com")
    member_user = User.objects.create_user(email="perm_regular@example.com")
    ws = Workspace.objects.filter(memberships__user=admin).first()
    assert ws is not None
    Membership.objects.create(workspace=ws, user=member_user, role=Membership.Role.MEMBER)

    request = factory.get("/")
    request.user = member_user  # type: ignore[attr-defined]

    view = MagicMock()
    view.kwargs = {"pk": str(ws.id)}

    perm = IsWorkspaceAdmin()
    assert perm.has_permission(request, view) is False  # type: ignore[arg-type]


@pytest.mark.django_db
def test_is_workspace_member_or_admin_blocks_viewer(factory: APIRequestFactory) -> None:
    admin = User.objects.create_user(email="perm_admin3@example.com")
    viewer_user = User.objects.create_user(email="perm_viewer@example.com")
    ws = Workspace.objects.filter(memberships__user=admin).first()
    assert ws is not None
    Membership.objects.create(workspace=ws, user=viewer_user, role=Membership.Role.VIEWER)

    request = factory.get("/")
    request.user = viewer_user  # type: ignore[attr-defined]

    view = MagicMock()
    view.kwargs = {"pk": str(ws.id)}

    perm = IsWorkspaceMemberOrAdmin()
    assert perm.has_permission(request, view) is False  # type: ignore[arg-type]
