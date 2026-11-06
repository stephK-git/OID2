"""Tests du flux public de signalement."""

from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_creer_et_suivre_signalement() -> None:
    payload = {
        "type": "rue",
        "lat": 5.35,
        "lon": -3.98,
        "hauteur_eau_cm": 40,
        "gravite": "moyenne",
        "danger_immediat": False,
        "description": "test",
    }
    r = client.post("/signalements", json=payload)
    assert r.status_code == 201
    body = r.json()
    ref = body["reference_suivi"]
    assert ref
    r2 = client.get(f"/signalements/{ref}")
    assert r2.status_code == 200
    assert r2.json()["reference_suivi"] == ref


def test_suivre_inconnu_404() -> None:
    r = client.get("/signalements/INEXISTANT")
    assert r.status_code == 404

def test_aggraver_signalement() -> None:
    payload = {
        "type": "rue",
        "lat": 5.35,
        "lon": -3.98,
        "hauteur_eau_cm": 40,
        "gravite": "moyenne",
        "danger_immediat": False,
        "description": "test aggravation",
    }
    r = client.post("/signalements", json=payload)
    assert r.status_code == 201
    ref = r.json()["reference_suivi"]

    r_agg = client.post(f"/signalements/{ref}/aggraver")
    assert r_agg.status_code == 200
    assert r_agg.json()["danger_immediat"] is True

    r_check = client.get(f"/signalements/{ref}")
    assert r_check.status_code == 200
    assert r_check.json()["danger_immediat"] is True
    assert r_check.json()["gravite"] == "critique"

