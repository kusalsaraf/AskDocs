import pytest


@pytest.mark.django_db
def test_factory_returns_platform_default_when_no_config(workspace):
    from apps.providers.llm.default import PlatformDefaultProvider
    from apps.providers.llm.factory import get_llm_provider_for_workspace

    provider = get_llm_provider_for_workspace(workspace)
    assert isinstance(provider, PlatformDefaultProvider)


@pytest.mark.django_db
def test_factory_returns_openai_provider_for_openai_config(workspace):
    from apps.providers.crypto import encrypt_api_key
    from apps.providers.llm.factory import get_llm_provider_for_workspace
    from apps.providers.llm.openai_provider import OpenAIProvider
    from apps.providers.models import ProviderConfig

    ProviderConfig.objects.create(
        workspace=workspace,
        provider_name="openai",
        encrypted_api_key=encrypt_api_key("sk-test"),
        api_key_last_4="test",
        model_name="gpt-4o",
    )
    provider = get_llm_provider_for_workspace(workspace)
    assert isinstance(provider, OpenAIProvider)


@pytest.mark.django_db
def test_factory_returns_gemini_provider_for_gemini_config(workspace):
    from unittest.mock import patch

    from apps.providers.crypto import encrypt_api_key
    from apps.providers.llm.factory import get_llm_provider_for_workspace
    from apps.providers.llm.gemini import GeminiProvider
    from apps.providers.models import ProviderConfig
    with patch("google.generativeai.configure"):
        ProviderConfig.objects.create(
            workspace=workspace,
            provider_name="gemini",
            encrypted_api_key=encrypt_api_key("AIza-test"),
            api_key_last_4="test",
            model_name="gemini-1.5-flash",
        )
        provider = get_llm_provider_for_workspace(workspace)

    assert isinstance(provider, GeminiProvider)


@pytest.mark.django_db
def test_factory_returns_ollama_provider_for_ollama_config(workspace):
    from apps.providers.llm.factory import get_llm_provider_for_workspace
    from apps.providers.llm.ollama import OllamaProvider
    from apps.providers.models import ProviderConfig

    ProviderConfig.objects.create(
        workspace=workspace,
        provider_name="ollama",
        encrypted_api_key=None,
        api_key_last_4="",
        model_name="llama3",
        base_url="http://localhost:11434",
    )
    provider = get_llm_provider_for_workspace(workspace)
    assert isinstance(provider, OllamaProvider)


def test_supported_providers_list_contains_all_seven():
    from apps.providers.llm.registry import SUPPORTED_PROVIDERS

    names = {p["name"] for p in SUPPORTED_PROVIDERS}
    assert names == {"openai", "anthropic", "gemini", "azure", "mistral", "groq", "ollama"}


def test_supported_providers_have_required_fields():
    from apps.providers.llm.registry import SUPPORTED_PROVIDERS

    required = {
        "name", "display_name", "requires_api_key", "requires_base_url",
        "requires_region", "suggested_models", "description",
    }
    for provider in SUPPORTED_PROVIDERS:
        assert required.issubset(provider.keys()), f"Missing keys in {provider['name']}"
