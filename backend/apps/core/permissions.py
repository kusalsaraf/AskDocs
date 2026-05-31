import logging

from rest_framework.permissions import BasePermission
from rest_framework.permissions import IsAuthenticated as DRFIsAuthenticated
from rest_framework.request import Request
from rest_framework.views import APIView

logger = logging.getLogger(__name__)

# Re-export for consistency
IsAuthenticated = DRFIsAuthenticated


def _get_workspace_id(request: Request, view: APIView) -> str | None:
    kwargs: dict[str, str] = getattr(view, "kwargs", {})
    return (
        kwargs.get("workspace_id")
        or kwargs.get("pk")
        or request.META.get("HTTP_X_WORKSPACE_ID")
    )


class IsWorkspaceMember(BasePermission):
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
            role__in=[Membership.Role.ADMIN, Membership.Role.MEMBER],
        ).exists()
