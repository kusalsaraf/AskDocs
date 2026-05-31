import logging
from typing import Any

from rest_framework.request import Request

logger = logging.getLogger(__name__)


class WorkspaceScopedQuerysetMixin:
    """Filters a ViewSet queryset to the workspace in the URL or X-Workspace-Id header.

    Models used with this mixin must have a `workspace_id` field.
    Returns an empty queryset (rather than a 403) when the user is not a member;
    the permission class is responsible for raising the 403 first.
    """

    request: Request

    def _get_workspace_id(self) -> str | None:
        kwargs: dict[str, str] = getattr(self, "kwargs", {})
        return kwargs.get("workspace_id") or self.request.META.get("HTTP_X_WORKSPACE_ID")

    def get_queryset(self) -> Any:
        qs = super().get_queryset()  # type: ignore[misc]
        workspace_id = self._get_workspace_id()
        if not workspace_id:
            return qs.none()
        from apps.workspaces.models import Membership

        if not Membership.objects.filter(
            workspace_id=workspace_id, user=self.request.user
        ).exists():
            return qs.none()
        return qs.filter(workspace_id=workspace_id)
