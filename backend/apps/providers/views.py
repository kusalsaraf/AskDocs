"""REST API views for LLM provider configuration and testing.

Allows workspace admins to configure, test, and delete custom LLM
provider settings. Provides a public endpoint for listing supported
providers and a default-provider test endpoint.
"""
from __future__ import annotations

from typing import Any

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.exceptions import NotFound, WorkspaceAccessDenied
from apps.core.logging import get_logger
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

logger = get_logger(__name__)


def _get_admin_workspace(workspace_id: str, user: Any) -> Workspace:
    """Retrieve workspace and verify the user is an admin.

    Raises:
        NotFound: If the workspace does not exist.
        WorkspaceAccessDenied: If the user is not an admin.
    """
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
    """Get, update, or delete the workspace's LLM provider configuration.

    * ``GET``    — return current config, or platform-default info if none.
    * ``PUT``    — create or replace the provider configuration.
    * ``DELETE`` — remove custom config and revert to platform default.
    """

    permission_classes = [IsWorkspaceAdmin]

    def get(self, request: Request, workspace_id: str) -> Response:
        """Return the active provider config or platform-default fallback."""
        workspace = _get_admin_workspace(workspace_id, request.user)
        try:
            config = ProviderConfig.objects.get(workspace=workspace)
            return Response(ProviderConfigSerializer(config).data)
        except ProviderConfig.DoesNotExist:
            return Response(ProviderDefaultResponseSerializer({}).data)

    def put(self, request: Request, workspace_id: str) -> Response:
        """Create or replace the workspace's LLM provider configuration."""
        workspace = _get_admin_workspace(workspace_id, request.user)
        serializer = ProviderConfigWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        config = get_or_replace_config(
            workspace, serializer.validated_data, created_by=request.user
        )
        logger.info(
            "Provider config saved",
            extra={
                "workspace_id": str(workspace_id),
                "provider": config.provider_name,
                "model": config.model_name,
            },
        )
        return Response(ProviderConfigSerializer(config).data)

    def delete(self, request: Request, workspace_id: str) -> Response:
        """Delete the custom provider config, reverting to platform default."""
        workspace = _get_admin_workspace(workspace_id, request.user)
        delete_config(workspace)
        logger.info("Provider config deleted", extra={"workspace_id": str(workspace_id)})
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProviderTestView(APIView):
    """Test a provider configuration (saved or ad-hoc) by making a real API call."""

    permission_classes = [IsWorkspaceAdmin]

    def post(self, request: Request, workspace_id: str) -> Response:
        """Run a test call against the provider and return success/latency/error."""
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


class ProviderTestDefaultView(APIView):
    """Test the platform-default provider without touching the workspace config."""

    permission_classes = [IsWorkspaceAdmin]

    def post(self, request: Request, workspace_id: str) -> Response:
        """Instantiate the default provider and run a test call."""
        _get_admin_workspace(workspace_id, request.user)

        from apps.providers.llm.default import PlatformDefaultProvider

        try:
            provider = PlatformDefaultProvider()
        except Exception:
            logger.exception(
                "Failed to initialise platform-default provider",
                extra={"workspace_id": workspace_id},
            )
            return Response(
                ProviderTestResponseSerializer(
                    {"success": False, "latency_ms": 0, "model_echo": "", "error": "Platform default provider is not configured."}
                ).data
            )

        result = provider.test_connection()
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
    """Return the list of LLM providers supported by the platform (public)."""

    authentication_classes: list[type] = []
    permission_classes = [AllowAny]

    def get(self, request: Request) -> Response:
        """Return provider metadata (name, models, capabilities)."""
        return Response(SUPPORTED_PROVIDERS)
