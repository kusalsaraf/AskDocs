import pytest


def _url(workspace_id: object) -> str:
    return f"/api/v1/workspaces/{workspace_id}/provider/"


@pytest.mark.django_db
def test_get_returns_default_response_when_no_config(auth_client, workspace):
    response = auth_client.get(_url(workspace.id))
    assert response.status_code == 200
    data = response.json()
    assert data["using_platform_default"] is True
    assert data["provider_name"] == "gemini"


@pytest.mark.django_db
def test_put_creates_config_and_returns_masked_key(auth_client, workspace):
    payload = {
        "provider_name": "openai",
        "api_key": "sk-abcdefgh1234",
        "model_name": "gpt-4o",
        "temperature": 0.7,
        "max_tokens": 2048,
    }
    response = auth_client.put(_url(workspace.id), payload, format="json")
    assert response.status_code == 200
    data = response.json()
    assert data["provider_name"] == "openai"
    assert data["api_key_masked"] == "••••••••1234"
    assert "api_key" not in data
    assert "encrypted_api_key" not in data


@pytest.mark.django_db
def test_put_replaces_existing_config(auth_client, workspace):
    auth_client.put(
        _url(workspace.id),
        {"provider_name": "openai", "api_key": "sk-first", "model_name": "gpt-4o"},
        format="json",
    )
    auth_client.put(
        _url(workspace.id),
        {"provider_name": "gemini", "api_key": "AIza-second", "model_name": "gemini-1.5-pro"},
        format="json",
    )
    response = auth_client.get(_url(workspace.id))
    data = response.json()
    assert data["provider_name"] == "gemini"
    assert data["is_default"] is False


@pytest.mark.django_db
def test_get_after_put_shows_masked_key_not_plaintext(auth_client, workspace):
    auth_client.put(
        _url(workspace.id),
        {"provider_name": "openai", "api_key": "sk-supersecret9999", "model_name": "gpt-4o"},
        format="json",
    )
    response = auth_client.get(_url(workspace.id))
    data = response.json()
    assert "supersecret" not in str(data)
    assert data["api_key_masked"] == "••••••••9999"


@pytest.mark.django_db
def test_delete_removes_config(auth_client, workspace):
    auth_client.put(
        _url(workspace.id),
        {"provider_name": "openai", "api_key": "sk-test", "model_name": "gpt-4o"},
        format="json",
    )
    response = auth_client.delete(_url(workspace.id))
    assert response.status_code == 204

    get_response = auth_client.get(_url(workspace.id))
    assert get_response.json()["using_platform_default"] is True


@pytest.mark.django_db
def test_member_cannot_put(member_auth_client, workspace):
    response = member_auth_client.put(
        _url(workspace.id),
        {"provider_name": "openai", "api_key": "sk-x", "model_name": "gpt-4o"},
        format="json",
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_member_cannot_get(member_auth_client, workspace):
    response = member_auth_client.get(_url(workspace.id))
    assert response.status_code == 403


@pytest.mark.django_db
def test_viewer_cannot_put(viewer_auth_client, workspace):
    response = viewer_auth_client.put(
        _url(workspace.id),
        {"provider_name": "openai", "api_key": "sk-x", "model_name": "gpt-4o"},
        format="json",
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_azure_put_without_base_url_returns_400(auth_client, workspace):
    response = auth_client.put(
        _url(workspace.id),
        {"provider_name": "azure", "api_key": "key", "model_name": "my-deployment"},
        format="json",
    )
    assert response.status_code == 400
    assert "base_url" in str(response.json())


@pytest.mark.django_db
def test_azure_put_without_region_returns_400(auth_client, workspace):
    response = auth_client.put(
        _url(workspace.id),
        {
            "provider_name": "azure",
            "api_key": "key",
            "model_name": "my-deployment",
            "base_url": "https://my.openai.azure.com",
        },
        format="json",
    )
    assert response.status_code == 400
    assert "azure_region" in str(response.json())


@pytest.mark.django_db
def test_openai_put_without_api_key_returns_400(auth_client, workspace):
    response = auth_client.put(
        _url(workspace.id),
        {"provider_name": "openai", "model_name": "gpt-4o"},
        format="json",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_put_invalid_temperature_returns_400(auth_client, workspace):
    response = auth_client.put(
        _url(workspace.id),
        {"provider_name": "openai", "api_key": "sk-x", "model_name": "gpt-4o", "temperature": 1.5},
        format="json",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_cross_workspace_admin_cannot_access_other_workspace(auth_client, workspace, other_user):
    from apps.workspaces.services import create_workspace

    other_workspace = create_workspace(name="Other WS", user=other_user)
    response = auth_client.get(_url(other_workspace.id))
    assert response.status_code == 403


@pytest.mark.django_db
def test_unauthenticated_cannot_get(api_client, workspace):
    response = api_client.get(_url(workspace.id))
    assert response.status_code == 401
