"""REST API views for workspace, member, and invitation management.

Provides CRUD for workspaces, member role changes, invitation creation
and acceptance, and invitation resend.
"""
from __future__ import annotations

from typing import Any
from uuid import UUID

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from apps.core.logging import get_logger
from apps.core.permissions import IsWorkspaceAdmin, IsWorkspaceMember
from apps.workspaces.models import Membership, Workspace, WorkspaceInvitation
from apps.workspaces.serializers import (
    InvitationCreateSerializer,
    InvitationSerializer,
    MemberRoleUpdateSerializer,
    MembershipSerializer,
    WorkspaceCreateSerializer,
    WorkspaceSerializer,
    WorkspaceUpdateSerializer,
)
from apps.workspaces.services import (
    accept_invitation,
    change_member_role,
    create_invitation,
    create_workspace,
    delete_workspace,
    remove_member,
    resend_invitation,
    update_workspace,
)

logger = get_logger(__name__)


class WorkspaceViewSet(ModelViewSet[Workspace]):
    """CRUD operations for workspaces.

    * ``list`` / ``create`` — any authenticated user.
    * ``retrieve`` — any workspace member.
    * ``partial_update`` / ``destroy`` — workspace admin only.
    """

    serializer_class = WorkspaceSerializer

    def get_permissions(self) -> list[Any]:
        if self.action in ("list", "create"):
            return [IsAuthenticated()]
        if self.action == "retrieve":
            return [IsWorkspaceMember()]
        return [IsWorkspaceAdmin()]

    def get_queryset(self) -> Any:
        return (
            Workspace.objects.filter(memberships__user=self.request.user)
            .distinct()
            .order_by("-created_at")
        )

    def create(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        """Create a new workspace and assign the requesting user as admin."""
        serializer = WorkspaceCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        workspace = create_workspace(
            name=serializer.validated_data["name"], user=request.user
        )
        logger.info(
            "Workspace created",
            extra={"workspace_id": str(workspace.id), "user_id": str(request.user.id)},
        )
        return Response(WorkspaceSerializer(workspace).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        """Update workspace settings (name, etc.)."""
        workspace = self.get_object()
        serializer = WorkspaceUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updated = update_workspace(workspace, **serializer.validated_data)
        return Response(WorkspaceSerializer(updated).data)

    def destroy(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        """Delete a workspace (personal workspaces cannot be deleted)."""
        workspace = self.get_object()
        delete_workspace(workspace)
        logger.info(
            "Workspace deleted",
            extra={"workspace_id": str(workspace.id), "user_id": str(request.user.id)},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class MemberViewSet(ModelViewSet[Membership]):
    """Manage workspace members: list, change role, or remove.

    * ``list`` — any workspace member.
    * ``partial_update`` / ``destroy`` — workspace admin only.
    """

    serializer_class = MembershipSerializer
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_permissions(self) -> list[Any]:
        if self.action == "list":
            return [IsWorkspaceMember()]
        return [IsWorkspaceAdmin()]

    def _get_workspace(self) -> Workspace:
        """Return the workspace from the URL kwargs."""
        return Workspace.objects.get(id=self.kwargs["workspace_id"])

    def get_queryset(self) -> Any:
        return Membership.objects.filter(
            workspace_id=self.kwargs["workspace_id"]
        ).select_related("user")

    def partial_update(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        """Change a member's role within the workspace."""
        from apps.accounts.models import User

        workspace = self._get_workspace()
        try:
            target_user = User.objects.get(id=self.kwargs["user_id"])
        except User.DoesNotExist:
            return Response(
                {"error": {"code": "user_not_found", "message": "User not found."}},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = MemberRoleUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        membership = change_member_role(
            workspace=workspace,
            target_user=target_user,
            new_role=serializer.validated_data["role"],
            acting_user=request.user,
        )
        logger.info(
            "Member role changed",
            extra={
                "workspace_id": str(workspace.id),
                "target_user_id": str(target_user.id),
                "new_role": serializer.validated_data["role"],
            },
        )
        return Response(MembershipSerializer(membership).data)

    def destroy(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        """Remove a member from the workspace."""
        from apps.accounts.models import User

        workspace = self._get_workspace()
        try:
            target_user = User.objects.get(id=self.kwargs["user_id"])
        except User.DoesNotExist:
            return Response(
                {"error": {"code": "user_not_found", "message": "User not found."}},
                status=status.HTTP_404_NOT_FOUND,
            )
        remove_member(workspace=workspace, target_user=target_user)
        logger.info(
            "Member removed",
            extra={
                "workspace_id": str(workspace.id),
                "target_user_id": str(target_user.id),
            },
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class InvitationViewSet(ModelViewSet[WorkspaceInvitation]):
    """Manage workspace invitations: list pending or create new.

    Only workspace admins can create or view invitations.
    """

    serializer_class = InvitationSerializer
    http_method_names = ["get", "post", "head", "options"]

    def get_permissions(self) -> list[Any]:
        return [IsWorkspaceAdmin()]

    def get_queryset(self) -> Any:
        return WorkspaceInvitation.objects.filter(
            workspace_id=self.kwargs["workspace_id"],
            accepted_at__isnull=True,
        )

    def create(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        """Create (or re-send) a workspace invitation."""
        workspace = Workspace.objects.get(id=self.kwargs["workspace_id"])
        serializer = InvitationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invitation, created = create_invitation(
            workspace=workspace,
            email=serializer.validated_data["email"],
            role=serializer.validated_data["role"],
            invited_by=request.user,
        )
        http_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        logger.info(
            "Invitation %s",
            "created" if created else "resent",
            extra={
                "workspace_id": str(workspace.id),
                "email": serializer.validated_data["email"],
            },
        )
        return Response(InvitationSerializer(invitation).data, status=http_status)


class InvitationAcceptView(APIView):
    """Accept a workspace invitation using its unique token."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request, token: UUID, **kwargs: Any) -> Response:
        """Accept the invitation and join the workspace."""
        membership = accept_invitation(token=token, user=request.user)
        logger.info(
            "Invitation accepted",
            extra={
                "workspace_id": str(membership.workspace_id),
                "user_id": str(request.user.id),
            },
        )
        return Response(MembershipSerializer(membership).data, status=status.HTTP_200_OK)


class InvitationResendView(APIView):
    """Resend an existing invitation email."""

    def get_permissions(self) -> list[Any]:
        return [IsWorkspaceAdmin()]

    def post(
        self, request: Request, workspace_id: UUID, invitation_id: UUID, **kwargs: Any
    ) -> Response:
        """Resend the invitation email to the invitee."""
        workspace = get_object_or_404(Workspace, id=workspace_id)
        resend_invitation(
            invitation_id=invitation_id,
            workspace=workspace,
            acting_user=request.user,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
