from unittest.mock import MagicMock, patch

import pytest

from apps.providers.llm.base import ProviderTestResult


@pytest.mark.django_db
def test_get_or_replace_config_creates_new_config(workspace, user):
    from apps.providers.models import ProviderConfig
    from apps.providers.services import get_or_replace_config

    data = {
        "provider_name": "openai",
        "api_key": "sk-abc1234xyz",
        "model_name": "gpt-4o",
        "temperature": 0.5,
        "max_tokens": 1024,
    }
    config = get_or_replace_config(workspace, data, created_by=user)

    assert config.provider_name == "openai"
    assert config.model_name == "gpt-4o"
    assert config.api_key_last_4 == "4xyz"
    assert config.encrypted_api_key is not None
    assert config.last_test_status == "untested"
    assert ProviderConfig.objects.filter(workspace=workspace).count() == 1


@pytest.mark.django_db
def test_get_or_replace_config_replaces_existing(workspace, user):
    from apps.providers.models import ProviderConfig
    from apps.providers.services import get_or_replace_config

    get_or_replace_config(
        workspace,
        {"provider_name": "openai", "api_key": "sk-first", "model_name": "gpt-4o"},
        created_by=user,
    )
    get_or_replace_config(
        workspace,
        {"provider_name": "gemini", "api_key": "AIza-second", "model_name": "gemini-1.5-pro"},
        created_by=user,
    )

    assert ProviderConfig.objects.filter(workspace=workspace).count() == 1
    config = ProviderConfig.objects.get(workspace=workspace)
    assert config.provider_name == "gemini"


@pytest.mark.django_db
def test_delete_config_removes_record(workspace, user):
    from apps.providers.models import ProviderConfig
    from apps.providers.services import delete_config, get_or_replace_config

    get_or_replace_config(
        workspace,
        {"provider_name": "openai", "api_key": "sk-test", "model_name": "gpt-4o"},
        created_by=user,
    )
    delete_config(workspace)
    assert not ProviderConfig.objects.filter(workspace=workspace).exists()


@pytest.mark.django_db
def test_test_provider_updates_db_on_success(workspace, user):
    from apps.providers.models import ProviderConfig
    from apps.providers.services import get_or_replace_config, test_provider

    get_or_replace_config(
        workspace,
        {"provider_name": "openai", "api_key": "sk-test", "model_name": "gpt-4o"},
        created_by=user,
    )

    mock_result = ProviderTestResult(success=True, latency_ms=100, model_echo="ok")
    with patch("apps.providers.services.get_active_provider") as mock_factory:
        mock_provider = MagicMock()
        mock_provider.test_connection.return_value = mock_result
        mock_factory.return_value = mock_provider
        result = test_provider(workspace)

    config = ProviderConfig.objects.get(workspace=workspace)
    assert result.success is True
    assert config.last_test_status == "ok"
    assert config.last_tested_at is not None
    assert config.last_test_error == ""


@pytest.mark.django_db
def test_test_provider_updates_db_on_failure(workspace, user):
    from apps.providers.models import ProviderConfig
    from apps.providers.services import get_or_replace_config, test_provider

    get_or_replace_config(
        workspace,
        {"provider_name": "openai", "api_key": "sk-bad", "model_name": "gpt-4o"},
        created_by=user,
    )

    mock_result = ProviderTestResult(
        success=False, latency_ms=50, model_echo="", error="invalid key"
    )
    with patch("apps.providers.services.get_active_provider") as mock_factory:
        mock_provider = MagicMock()
        mock_provider.test_connection.return_value = mock_result
        mock_factory.return_value = mock_provider
        result = test_provider(workspace)

    config = ProviderConfig.objects.get(workspace=workspace)
    assert result.success is False
    assert config.last_test_status == "failed"
    assert config.last_test_error == "invalid key"
