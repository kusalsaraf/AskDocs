import logging
from typing import Any
from uuid import UUID

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

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

logger = logging.getLogger(__name__)


class WorkspaceViewSet(ModelViewSet[Workspace]):
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
        serializer = WorkspaceCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        workspace = create_workspace(
            name=serializer.validated_data["name"], user=request.user
        )
        return Response(WorkspaceSerializer(workspace).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        workspace = self.get_object()
        serializer = WorkspaceUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updated = update_workspace(workspace, **serializer.validated_data)
        return Response(WorkspaceSerializer(updated).data)

    def destroy(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        workspace = self.get_object()
        delete_workspace(workspace)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MemberViewSet(ModelViewSet[Membership]):
    serializer_class = MembershipSerializer
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_permissions(self) -> list[Any]:
        if self.action == "list":
            return [IsWorkspaceMember()]
        return [IsWorkspaceAdmin()]

    def _get_workspace(self) -> Workspace:
        return Workspace.objects.get(id=self.kwargs["workspace_id"])

    def get_queryset(self) -> Any:
        return Membership.objects.filter(
            workspace_id=self.kwargs["workspace_id"]
        ).select_related("user")

    def partial_update(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        from apps.accounts.models import User

        workspace = self._get_workspace()
        target_user = User.objects.get(id=self.kwargs["user_id"])
        serializer = MemberRoleUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        membership = change_member_role(
            workspace=workspace,
            target_user=target_user,
            new_role=serializer.validated_data["role"],
            acting_user=request.user,
        )
        return Response(MembershipSerializer(membership).data)

    def destroy(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        from apps.accounts.models import User

        workspace = self._get_workspace()
        target_user = User.objects.get(id=self.kwargs["user_id"])
        remove_member(workspace=workspace, target_user=target_user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class InvitationViewSet(ModelViewSet[WorkspaceInvitation]):
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
        workspace = Workspace.objects.get(id=self.kwargs["workspace_id"])
        serializer = InvitationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invitation = create_invitation(
            workspace=workspace,
            email=serializer.validated_data["email"],
            role=serializer.validated_data["role"],
            invited_by=request.user,
        )
        return Response(InvitationSerializer(invitation).data, status=status.HTTP_201_CREATED)


class InvitationAcceptView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request: Request, token: UUID, **kwargs: Any) -> Response:
        membership = accept_invitation(token=token, user=request.user)
        return Response(MembershipSerializer(membership).data, status=status.HTTP_200_OK)


class InvitationResendView(APIView):
    permission_classes = [IsWorkspaceAdmin()]

    def get_permissions(self) -> list[Any]:
        return [IsWorkspaceAdmin()]

    def post(
        self, request: Request, workspace_id: UUID, invitation_id: UUID, **kwargs: Any
    ) -> Response:
        workspace = get_object_or_404(Workspace, id=workspace_id)
        resend_invitation(
            invitation_id=invitation_id,
            workspace=workspace,
            acting_user=request.user,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
