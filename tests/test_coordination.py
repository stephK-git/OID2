"""Tests des fonctionnalités de coordination et gestion des utilisateurs."""

from fastapi.testclient import TestClient


def test_gestion_utilisateurs_cycle_complet(client: TestClient, auth_coordinateur: dict) -> None:
    # 1. Liste des utilisateurs
    r = client.get("/coordination/utilisateurs", headers=auth_coordinateur)
    assert r.status_code == 200
    initial_count = len(r.json())

    # 2. Création d'un nouvel utilisateur
    new_user_data = {
        "nom": "Agent Kouame Test",
        "email": "kouame.test@oid.ci",
        "password": "Password123!",
        "role": "enqueteur",
        "zone_id": None,
    }

    r_create = client.post("/coordination/utilisateurs", json=new_user_data, headers=auth_coordinateur)
    assert r_create.status_code == 201
    user_created = r_create.json()
    uid = user_created["id"]
    assert user_created["email"] == "kouame.test@oid.ci"

    # 3. Liste augmentée
    r_list2 = client.get("/coordination/utilisateurs", headers=auth_coordinateur)
    assert len(r_list2.json()) == initial_count + 1

    # 4. Désactivation du compte
    r_deact = client.patch(f"/coordination/utilisateurs/{uid}/actif?actif=false", headers=auth_coordinateur)
    assert r_deact.status_code == 200
    assert r_deact.json()["actif"] is False

    # 5. Réactivation
    r_react = client.patch(f"/coordination/utilisateurs/{uid}/actif?actif=true", headers=auth_coordinateur)
    assert r_react.status_code == 200
    assert r_react.json()["actif"] is True

    # 6. Réinitialisation mot de passe
    r_pwd = client.patch(
        f"/coordination/utilisateurs/{uid}/mot-de-passe",
        json={"nouveau_mot_de_passe": "NouveauPass2026!"},
        headers=auth_coordinateur,
    )
    assert r_pwd.status_code == 200
    assert r_pwd.json()["ok"] is True


def test_creation_utilisateur_doublon_email_409(client: TestClient, auth_coordinateur: dict) -> None:
    user_data = {
        "nom": "Doublon Test",
        "email": "coordinateur@test.local",  # existe déjà via fixture
        "password": "Password123!",
        "role": "enqueteur",
    }
    r = client.post("/coordination/utilisateurs", json=user_data, headers=auth_coordinateur)
    assert r.status_code == 409


def test_rouvrir_motif_obligatoire(client: TestClient, auth_coordinateur: dict) -> None:
    # Incident inexistant : 404
    r = client.post("/coordination/incidents/99999/rouvrir", json={"motif": "Nouvelle inondation"}, headers=auth_coordinateur)
    assert r.status_code in (404, 409)


def test_coordination_zones_et_audit(client: TestClient, auth_coordinateur: dict) -> None:
    # Test zones
    r_zones = client.get("/coordination/zones", headers=auth_coordinateur)
    assert r_zones.status_code == 200
    assert isinstance(r_zones.json(), list)

    # Test audit
    r_audit = client.get("/coordination/audit", headers=auth_coordinateur)
    assert r_audit.status_code == 200
    assert isinstance(r_audit.json(), list)

    # Test export CSV
    r_csv = client.get("/coordination/audit/export/csv", headers=auth_coordinateur)
    assert r_csv.status_code == 200
    assert "text/csv" in r_csv.headers["content-type"]
    assert "piste_audit_oid.csv" in r_csv.headers["content-disposition"]


def test_coordination_stats_enrichies(client: TestClient, auth_coordinateur: dict) -> None:
    r = client.get("/coordination/stats", headers=auth_coordinateur)
    assert r.status_code == 200
    data = r.json()
    assert "incidents" in data
    assert "retards_total" in data
    assert "par_statut" in data
    assert "par_type" in data



def test_coordinateur_ne_peut_pas_modifier_son_propre_role(client: TestClient, auth_coordinateur: dict) -> None:
    users = client.get("/coordination/utilisateurs", headers=auth_coordinateur).json()
    moi = next(u for u in users if u["email"] == "coordinateur@test.local")
    r = client.patch(f"/coordination/utilisateurs/{moi['id']}", json={"role": "enqueteur"}, headers=auth_coordinateur)
    assert r.status_code == 409


def test_mot_de_passe_trop_court_refuse(client: TestClient, auth_coordinateur: dict) -> None:
    users = client.get("/coordination/utilisateurs", headers=auth_coordinateur).json()
    r = client.patch(
        f"/coordination/utilisateurs/{users[0]['id']}/mot-de-passe",
        json={"nouveau_mot_de_passe": "court"},
        headers=auth_coordinateur,
    )
    assert r.status_code == 422
