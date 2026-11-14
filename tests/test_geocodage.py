"""Tests du géocodage inverse côté serveur (Nominatim simulé, aucun appel réseau)."""

import json

import pytest

from app.services import geocodage


class _FauxReponse:
    def __init__(self, payload):
        self._payload = payload

    def read(self):
        return json.dumps(self._payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


@pytest.fixture(autouse=True)
def _reset(monkeypatch):
    geocodage._cache.clear()
    monkeypatch.setattr(geocodage, "MIN_INTERVAL_S", 0)


def test_extrait_commune_quartier_rue(monkeypatch):
    payload = {
        "address": {
            "city_district": "Cocody",
            "neighbourhood": "Riviera Palmeraie",
            "road": "Boulevard Mitterrand",
        }
    }
    monkeypatch.setattr(
        geocodage.urllib.request, "urlopen", lambda *a, **k: _FauxReponse(payload)
    )
    res = geocodage.adresse_depuis_coordonnees(5.36, -3.99)
    assert res == {
        "commune": "Cocody",
        "quartier": "Riviera Palmeraie",
        "rue": "Boulevard Mitterrand",
    }


def test_cache_evite_un_second_appel(monkeypatch):
    appels = []

    def faux_urlopen(*a, **k):
        appels.append(1)
        return _FauxReponse({"address": {"road": "Rue 12"}})

    monkeypatch.setattr(geocodage.urllib.request, "urlopen", faux_urlopen)
    geocodage.adresse_depuis_coordonnees(5.36001, -3.99001)
    geocodage.adresse_depuis_coordonnees(5.36002, -3.99002)  # même cellule de 4 décimales
    assert len(appels) == 1


def test_echec_reseau_ne_leve_pas_et_nest_pas_mis_en_cache(monkeypatch):
    def echec(*a, **k):
        raise geocodage.urllib.error.URLError("hors-ligne")

    monkeypatch.setattr(geocodage.urllib.request, "urlopen", echec)
    res = geocodage.adresse_depuis_coordonnees(5.3, -4.0)
    assert res == {"commune": None, "quartier": None, "rue": None}
    assert geocodage._cache == {}
