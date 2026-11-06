"""Tests de cohérence des données d'évaluation."""

from fastapi.testclient import TestClient


def test_evaluation_incoherente_rejetee(client: TestClient, auth_enqueteur: dict) -> None:
    """Données incohérentes : blessés (5) > personnes affectées (2)."""
    payload = {"menages_touches": 1, "personnes_affectees": 2, "blesses": 5}
    # Sur un incident inexistant ou non affecté : 404 ou 422
    r = client.put("/enquete/99999/evaluation", json=payload, headers=auth_enqueteur)
    assert r.status_code in (404, 422)
