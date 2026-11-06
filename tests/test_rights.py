"""Tests des droits d'accès (RBAC)."""

from fastapi.testclient import TestClient


def test_verification_file_sans_auth(client: TestClient) -> None:
    """L'accès à la file de vérification sans token doit retourner 401."""
    r = client.get("/verification/file")
    assert r.status_code == 401


def test_verification_file_enqueteur_interdit(client: TestClient, auth_enqueteur: dict) -> None:
    """Un enquêteur ne peut pas accéder à la file de vérification (403)."""
    r = client.get("/verification/file", headers=auth_enqueteur)
    assert r.status_code == 403


def test_verification_file_verificateur_ok(client: TestClient, auth_verificateur: dict) -> None:
    """Un vérificateur peut accéder à la file (200, liste vide au départ)."""
    r = client.get("/verification/file", headers=auth_verificateur)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_enquete_mes_dossiers_sans_auth(client: TestClient) -> None:
    """L'accès aux dossiers sans token doit retourner 401."""
    r = client.get("/enquete/mes-dossiers")
    assert r.status_code == 401


def test_enquete_mes_dossiers_verificateur_interdit(client: TestClient, auth_verificateur: dict) -> None:
    """Un vérificateur ne peut pas accéder aux dossiers enquêteur (403)."""
    r = client.get("/enquete/mes-dossiers", headers=auth_verificateur)
    assert r.status_code == 403


def test_coordination_stats_sans_auth(client: TestClient) -> None:
    """Les stats sans token doivent retourner 401."""
    r = client.get("/coordination/stats")
    assert r.status_code == 401


def test_coordination_stats_enqueteur_interdit(client: TestClient, auth_enqueteur: dict) -> None:
    """Un enquêteur ne peut pas accéder aux stats (403)."""
    r = client.get("/coordination/stats", headers=auth_enqueteur)
    assert r.status_code == 403


def test_coordination_utilisateurs_enqueteur_interdit(client: TestClient, auth_enqueteur: dict) -> None:
    """Un enquêteur ne peut pas lister les utilisateurs (403)."""
    r = client.get("/coordination/utilisateurs", headers=auth_enqueteur)
    assert r.status_code == 403
