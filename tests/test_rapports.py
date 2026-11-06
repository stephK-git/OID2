"""Tests des rapports et exports."""

from fastapi.testclient import TestClient


def test_sitrep_coordinateur_ok(client: TestClient, auth_coordinateur: dict) -> None:
    r = client.get("/rapports/sitrep", headers=auth_coordinateur)
    assert r.status_code == 200
    data = r.json()
    assert "incidents_total" in data or "incidents" in data or "date" in data


def test_export_geojson_ok(client: TestClient, auth_coordinateur: dict) -> None:
    r = client.get("/rapports/export/geojson", headers=auth_coordinateur)
    assert r.status_code == 200
    assert r.json().get("type") == "FeatureCollection"


def test_rapports_forbidden_verificateur(client: TestClient, auth_verificateur: dict) -> None:
    r = client.get("/rapports/sitrep", headers=auth_verificateur)
    assert r.status_code == 403
