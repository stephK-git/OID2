"""Géocodage inverse via Nominatim (OpenStreetMap), appelé côté serveur.

Pourquoi côté serveur : la politique d'usage de Nominatim impose au plus
1 requête par seconde, un User-Agent identifiant l'application et du cache.
Le navigateur du citoyen n'envoie plus sa position à un service tiers.
"""

import json
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
USER_AGENT = "OID-Abidjan/1.0 (plateforme de signalement des inondations)"
CACHE_TTL_S = 24 * 3600
CACHE_MAX = 2000
MIN_INTERVAL_S = 1.0
TIMEOUT_S = 6

_cache: dict[tuple[float, float], tuple[float, dict]] = {}
_lock = threading.Lock()
_last_call = 0.0


def _cle(lat: float, lon: float) -> tuple[float, float]:
    # 4 décimales ≈ 11 m : deux clics proches partagent la même réponse
    return (round(lat, 4), round(lon, 4))


def _extraire(data: dict) -> dict:
    addr = data.get("address") or {}
    commune = (
        addr.get("city_district")
        or addr.get("municipality")
        or addr.get("borough")
        or addr.get("town")
        or addr.get("suburb")
    )
    quartier = (
        addr.get("neighbourhood")
        or addr.get("suburb")
        or addr.get("quarter")
        or addr.get("residential")
        or addr.get("hamlet")
        or addr.get("village")
    )
    rue = (
        addr.get("road")
        or addr.get("pedestrian")
        or addr.get("amenity")
        or addr.get("building")
        or addr.get("shop")
        or data.get("name")
    )
    return {"commune": commune or None, "quartier": quartier or None, "rue": rue or None}


def adresse_depuis_coordonnees(lat: float, lon: float) -> dict:
    """Retourne {commune, quartier, rue} (valeurs possiblement None). Ne lève jamais."""
    global _last_call
    cle = _cle(lat, lon)
    now = time.monotonic()

    with _lock:
        hit = _cache.get(cle)
        if hit and now - hit[0] < CACHE_TTL_S:
            return hit[1]

        # Un seul appel sortant à la fois, espacés d'au moins 1 s
        attente = MIN_INTERVAL_S - (now - _last_call)
        if attente > 0:
            time.sleep(attente)

        params = urllib.parse.urlencode(
            {
                "format": "jsonv2",
                "lat": f"{cle[0]}",
                "lon": f"{cle[1]}",
                "zoom": 18,
                "addressdetails": 1,
                "accept-language": "fr",
            }
        )
        req = urllib.request.Request(
            f"{NOMINATIM_URL}?{params}",
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        )
        _last_call = time.monotonic()
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
                resultat = _extraire(json.loads(resp.read().decode("utf-8")))
        except (urllib.error.URLError, TimeoutError, ValueError, OSError):
            # Échec non mis en cache : le prochain essai peut réussir
            return {"commune": None, "quartier": None, "rue": None}

        if len(_cache) >= CACHE_MAX:
            _cache.pop(next(iter(_cache)))
        _cache[cle] = (time.monotonic(), resultat)
        return resultat
