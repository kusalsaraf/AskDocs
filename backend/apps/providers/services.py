from __future__ import annotations

from typing import TYPE_CHECKING, Any

from django.utils import timezone

from apps.core.logging import get_logger
from apps.providers.crypto import encrypt_api_key, get_last_4
from apps.providers.llm.base import BaseLLMProvider, ProviderTestResult
from apps.providers.llm.factory import get_llm_provider_for_workspace
from apps.providers.models import ProviderConfig

if TYPE_CHECKING:
    from apps.accounts.models import User
    from apps.workspaces.models import Workspace

logger = get_logger(__name__)


def get_or_replace_config(
    workspace: Workspace,
    data: dict[str, Any],
    created_by: User,
) -> ProviderConfig:
    """Create or replace the workspace's ProviderConfig. Resets test status on every write."""
    api_key: str = data.get("api_key", "")
    defaults: dict[str, Any] = {
        "provider_name": data["provider_name"],
        "model_name": data.get("model_name", ""),
        "temperature": data.get("temperature", 0.7),
        "max_tokens": data.get("max_tokens", 2048),
        "base_url": data.get("base_url"),
        "azure_region": data.get("azure_region"),
        "created_by": created_by,
        "last_test_status": ProviderConfig.TestStatus.UNTESTED,
        "last_test_error": "",
        "last_tested_at": None,
    }
    if api_key:
        defaults["encrypted_api_key"] = encrypt_api_key(api_key)
        defaults["api_key_last_4"] = get_last_4(api_key)
    else:
        defaults["encrypted_api_key"] = None
        defaults["api_key_last_4"] = ""

    config, created = ProviderConfig.objects.update_or_create(
        workspace=workspace,
        defaults=defaults,
    )
    action = "created" if created else "replaced"
    logger.info(
        f"ProviderConfig {action}",
        extra={"workspace_id": str(workspace.id), "provider": config.provider_name},
    )
    return config


def delete_config(workspace: Workspace) -> None:
    deleted, _ = ProviderConfig.objects.filter(workspace=workspace).delete()
    logger.info(
        "ProviderConfig deleted",
        extra={"workspace_id": str(workspace.id), "deleted": deleted},
    )


def get_active_provider(workspace: Workspace) -> BaseLLMProvider:
    """Phase 5's single entry point for resolving the active LLM provider."""
    return get_llm_provider_for_workspace(workspace)


def test_provider(workspace: Workspace) -> ProviderTestResult:
    """Run test_connection against the workspace's provider; persist result to DB."""
    provider = get_active_provider(workspace)
    result = provider.test_connection()

    ProviderConfig.objects.filter(workspace=workspace).update(
        last_tested_at=timezone.now(),
        last_test_status=(
            ProviderConfig.TestStatus.OK if result.success else ProviderConfig.TestStatus.FAILED
        ),
        last_test_error="" if result.success else (result.error or ""),
    )
    logger.info(
        "Provider test complete",
        extra={
            "workspace_id": str(workspace.id),
            "success": result.success,
            "latency_ms": result.latency_ms,
        },
    )
    return result
