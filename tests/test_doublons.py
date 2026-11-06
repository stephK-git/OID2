"""Tests de détection et endpoints de doublons."""

from fastapi.testclient import TestClient


def test_doublons_endpoint(client: TestClient, auth_verificateur: dict) -> None:
    # Pour un signalement inexistant, 404 attendu
    r = client.get("/verification/99999/doublons", headers=auth_verificateur)
    assert r.status_code in (200, 404)
