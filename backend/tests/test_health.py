import pytest
from django.test import Client


@pytest.mark.django_db
def test_health_check_returns_200(client: Client) -> None:
    response = client.get("/api/health/")
    assert response.status_code == 200


@pytest.mark.django_db
def test_health_check_body(client: Client) -> None:
    response = client.get("/api/health/")
    data = response.json()
    assert data["status"] in ("ok", "degraded")
    assert data["version"] == "0.1.0"
    assert "database" in data["checks"]
    assert "redis" in data["checks"]
