import pytest


@pytest.mark.django_db
def test_supported_providers_no_auth_required(api_client):
    response = api_client.get("/api/v1/providers/supported/")
    assert response.status_code == 200


def test_supported_providers_returns_all_seven(api_client):
    response = api_client.get("/api/v1/providers/supported/")
    data = response.json()
    assert len(data) == 7
    names = {p["name"] for p in data}
    assert names == {"openai", "anthropic", "gemini", "azure", "mistral", "groq", "ollama"}


def test_supported_providers_have_correct_flags(api_client):
    response = api_client.get("/api/v1/providers/supported/")
    by_name = {p["name"]: p for p in response.json()}

    assert by_name["ollama"]["requires_api_key"] is False
    assert by_name["ollama"]["requires_base_url"] is True
    assert by_name["azure"]["requires_api_key"] is True
    assert by_name["azure"]["requires_base_url"] is True
    assert by_name["azure"]["requires_region"] is True
    assert by_name["openai"]["requires_base_url"] is False
    assert by_name["openai"]["requires_region"] is False
