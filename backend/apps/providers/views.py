from __future__ import annotations

from typing import Any

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.exceptions import NotFound, WorkspaceAccessDenied
from apps.core.permissions import IsWorkspaceAdmin
from apps.providers.llm.registry import SUPPORTED_PROVIDERS
from apps.providers.models import ProviderConfig
from apps.providers.rate_limit import check_test_rate_limit
from apps.providers.serializers import (
    ProviderConfigSerializer,
    ProviderConfigWriteSerializer,
    ProviderDefaultResponseSerializer,
    ProviderTestRequestSerializer,
    ProviderTestResponseSerializer,
)
from apps.providers.services import delete_config, get_or_replace_config, test_provider, test_provider_from_payload
from apps.workspaces.models import Membership, Workspace


def _get_admin_workspace(workspace_id: str, user: Any) -> Workspace:
    try:
        workspace = Workspace.objects.get(id=workspace_id)
    except Workspace.DoesNotExist:
        raise NotFound("Workspace not found.") from None
    if not Membership.objects.filter(
        workspace=workspace, user=user, role=Membership.Role.ADMIN
    ).exists():
        raise WorkspaceAccessDenied()
    return workspace


class ProviderConfigView(APIView):
    permission_classes = [IsWorkspaceAdmin]

    def get(self, request: Request, workspace_id: str) -> Response:
        workspace = _get_admin_workspace(workspace_id, request.user)
        try:
            config = ProviderConfig.objects.get(workspace=workspace)
            return Response(ProviderConfigSerializer(config).data)
        except ProviderConfig.DoesNotExist:
            return Response(ProviderDefaultResponseSerializer({}).data)

    def put(self, request: Request, workspace_id: str) -> Response:
        workspace = _get_admin_workspace(workspace_id, request.user)
        serializer = ProviderConfigWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        config = get_or_replace_config(
            workspace, serializer.validated_data, created_by=request.user
        )
        return Response(ProviderConfigSerializer(config).data)

    def delete(self, request: Request, workspace_id: str) -> Response:
        workspace = _get_admin_workspace(workspace_id, request.user)
        delete_config(workspace)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProviderTestView(APIView):
    permission_classes = [IsWorkspaceAdmin]

    def post(self, request: Request, workspace_id: str) -> Response:
        workspace = _get_admin_workspace(workspace_id, request.user)
        check_test_rate_limit(str(workspace.id))

        if request.data:
            serializer = ProviderTestRequestSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            result = test_provider_from_payload(workspace, serializer.validated_data)
        else:
            result = test_provider(workspace)

        return Response(
            ProviderTestResponseSerializer(
                {
                    "success": result.success,
                    "latency_ms": result.latency_ms,
                    "model_echo": result.model_echo,
                    "error": result.error,
                }
            ).data
        )


class SupportedProvidersView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request: Request) -> Response:
        return Response(SUPPORTED_PROVIDERS)
