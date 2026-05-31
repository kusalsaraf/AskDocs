from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.views import APIView


class IsWorkspaceMember(BasePermission):
    """Phase 2: will verify workspace membership from JWT claims."""

    def has_permission(self, request: Request, view: APIView) -> bool:
        return bool(request.user and request.user.is_authenticated)
