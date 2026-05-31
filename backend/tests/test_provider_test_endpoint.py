from unittest.mock import patch

import pytest

from apps.providers.llm.base import ProviderTestResult


def _test_url(workspace_id: object) -> str:
    return f"/api/v1/workspaces/{workspace_id}/provider/test/"


def _create_config(workspace, user):
    from apps.providers.services import get_or_replace_config

    return get_or_replace_config(
        workspace,
        {"provider_name": "openai", "api_key": "sk-test", "model_name": "gpt-4o"},
        created_by=user,
    )


@pytest.mark.django_db
def test_test_endpoint_returns_success_on_mocked_ok(auth_client, workspace, user):
    _create_config(workspace, user)

    mock_result = ProviderTestResult(success=True, latency_ms=123, model_echo="ok")
    with patch("apps.providers.views.test_provider", return_value=mock_result):
        response = auth_client.post(_test_url(workspace.id))

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["latency_ms"] == 123
    assert data["model_echo"] == "ok"
    assert data["error"] is None


@pytest.mark.django_db
def test_test_endpoint_returns_failure_on_mocked_error(auth_client, workspace, user):
    _create_config(workspace, user)

    mock_result = ProviderTestResult(
        success=False, latency_ms=50, model_echo="", error="invalid api key"
    )
    with patch("apps.providers.views.test_provider", return_value=mock_result):
        response = auth_client.post(_test_url(workspace.id))

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is False
    assert data["error"] == "invalid api key"


@pytest.mark.django_db
def test_test_endpoint_rate_limited_after_10_calls(auth_client, workspace, user):
    _create_config(workspace, user)

    mock_result = ProviderTestResult(success=True, latency_ms=10, model_echo="ok")
    with patch("apps.providers.views.test_provider", return_value=mock_result):
        for _ in range(10):
            resp = auth_client.post(_test_url(workspace.id))
            assert resp.status_code == 200

        # 11th call must be rate-limited
        resp = auth_client.post(_test_url(workspace.id))
    assert resp.status_code == 429


@pytest.mark.django_db
def test_test_endpoint_requires_admin(member_auth_client, workspace):
    response = member_auth_client.post(_test_url(workspace.id))
    assert response.status_code == 403
