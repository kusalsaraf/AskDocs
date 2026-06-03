"""Workspace-aware DRF permission classes.

Each class resolves the target workspace from the URL kwargs
(``workspace_id`` or ``pk``) or the ``X-Workspace-ID`` header,
then checks the requesting user's membership role.
"""
from __future__ import annotations

from rest_framework.permissions import BasePermission
from rest_framework.permissions import IsAuthenticated as DRFIsAuthenticated
from rest_framework.request import Request
from rest_framework.views import APIView

IsAuthenticated = DRFIsAuthenticated


def _get_workspace_id(request: Request, view: APIView) -> str | None:
    """Extract the workspace ID from URL kwargs or request header."""
    kwargs: dict[str, str] = getattr(view, "kwargs", {})
    return (
        kwargs.get("workspace_id")
        or kwargs.get("pk")
        or request.META.get("HTTP_X_WORKSPACE_ID")
    )


class IsWorkspaceMember(BasePermission):
    """Allow any authenticated member of the workspace (any role)."""

    def has_permission(self, request: Request, view: APIView) -> bool:
        if not (request.user and request.user.is_authenticated):
            return False
        workspace_id = _get_workspace_id(request, view)
        if not workspace_id:
            return False
        from apps.workspaces.models import Membership

        return Membership.objects.filter(  # type: ignore[return-value]
            workspace_id=workspace_id, user=request.user
        ).exists()


class IsWorkspaceAdmin(BasePermission):
    """Allow only workspace administrators."""

    def has_permission(self, request: Request, view: APIView) -> bool:
        if not (request.user and request.user.is_authenticated):
            return False
        workspace_id = _get_workspace_id(request, view)
        if not workspace_id:
            return False
        from apps.workspaces.models import Membership

        return Membership.objects.filter(  # type: ignore[return-value]
            workspace_id=workspace_id,
            user=request.user,
            role=Membership.Role.ADMIN,
        ).exists()


class IsWorkspaceMemberOrAdmin(BasePermission):
    """Allow read access to any member; restrict writes to ADMIN and MEMBER roles.

    VIEWERs may perform safe methods (GET, HEAD, OPTIONS) but cannot
    create, update, or delete resources.
    """

    def has_permission(self, request: Request, view: APIView) -> bool:
        if not (request.user and request.user.is_authenticated):
            return False
        workspace_id = _get_workspace_id(request, view)
        if not workspace_id:
            return False
        from apps.workspaces.models import Membership

        if request.method in ("GET", "HEAD", "OPTIONS"):
            return Membership.objects.filter(  # type: ignore[return-value]
                workspace_id=workspace_id, user=request.user
            ).exists()
        return Membership.objects.filter(  # type: ignore[return-value]
            workspace_id=workspace_id,
            user=request.user,
            role__in=[Membership.Role.ADMIN, Membership.Role.MEMBER],
        ).exists()
