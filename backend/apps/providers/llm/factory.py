from apps.providers.llm.base import BaseLLMProvider
from apps.providers.llm.default import PlatformDefaultProvider
from apps.providers.llm.exceptions import ProviderConfigInvalid
from apps.providers.llm.registry import PROVIDER_REGISTRY
from apps.workspaces.models import Workspace


def get_llm_provider_for_workspace(workspace: Workspace) -> BaseLLMProvider:
    from apps.providers.models import ProviderConfig

    try:
        config = ProviderConfig.objects.get(workspace=workspace)
    except ProviderConfig.DoesNotExist:
        return PlatformDefaultProvider()

    provider_class = PROVIDER_REGISTRY.get(config.provider_name)
    if provider_class is None:
        raise ProviderConfigInvalid(
            f"Unknown provider '{config.provider_name}'. "
            f"Valid options: {', '.join(PROVIDER_REGISTRY.keys())}"
        )
    return provider_class(config)
