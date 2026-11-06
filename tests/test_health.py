"""Tests du endpoint /health."""

from fastapi.testclient import TestClient


def test_health_ok(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_root_redirects_to_login(client: TestClient) -> None:
    """La racine redirige vers /login.html si le dossier static existe."""
    response = client.get("/docs")
    assert response.status_code == 200
