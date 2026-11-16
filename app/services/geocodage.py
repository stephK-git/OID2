"""Géocodage inverse via Nominatim (OpenStreetMap) avec repli local Abidjan et cache."""

import json
import math
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
_pending_bg: set[tuple[float, float]] = set()
_lock = threading.Lock()
_last_call = 0.0

# Référentiel local des quartiers et axes majeurs du District Autonome d'Abidjan
# Utilisé en repli instantané (0 ms) quand Nominatim n'est pas encore en cache ou hors-ligne.
_REPERES_ABIDJAN: list[tuple[float, float, str, str, str]] = [
    (5.3675, -3.9585, "Cocody", "Riviera Palmeraie", "Rue Ministre / Carrefour Guiraud"),
    (5.3599, -3.9870, "Cocody", "Riviera 2", "Boulevard François Mitterrand"),
    (5.3535, -3.9685, "Cocody", "Riviera 3 / Bonoumin", "Voie Express Riviera"),
    (5.3442, -3.9375, "Cocody", "Riviera Golf / M'Badon", "Boulevard de France"),
    (5.3772, -3.9788, "Cocody", "Angré 8e Tranche", "Boulevard Latrille Prolongé"),
    (5.3910, -3.9860, "Cocody", "Angré Château", "Voie Principale Djibi"),
    (5.3688, -4.0005, "Cocody", "Deux-Plateaux Vallon", "Rue des Jardins"),
    (5.3580, -4.0055, "Cocody", "Deux-Plateaux ENA", "Boulevard Latrille"),
    (5.3295, -3.9975, "Cocody", "Blockhauss / Cocody Centre", "Boulevard de la Corniche"),
    (5.3468, -4.0118, "Cocody", "Danga / Lycée Technique", "Avenue Jean Mermoz"),
    (5.3476, -4.0890, "Yopougon", "Niangon Nord / Banco", "Boulevard Principal de Yopougon"),
    (5.3310, -4.0950, "Yopougon", "Niangon Sud / Académie", "Rue Princesse / Axe Niangon"),
    (5.3560, -4.0720, "Yopougon", "Maroc / Ananerais", "Rue Kouté / Carrefour Maroc"),
    (5.3415, -4.0630, "Yopougon", "Toits Rouges / Siporex", "Autoroute du Nord · Sortie Siporex"),
    (5.3635, -4.1080, "Yopougon", "Gesco / Manutention", "Route de Dabou"),
    (5.3245, -4.0735, "Yopougon", "Millionnaire / Sideci", "Axe Palais de Justice"),
    (5.4161, -4.0159, "Abobo", "Abobo Gare / Samaké", "Voie Express Abobo"),
    (5.4015, -4.0085, "Abobo", "Dokui / Plateau Dokui", "Route du Zoo / Axe Dokui"),
    (5.4320, -4.0225, "Abobo", "Avocatier / Kennedy", "Axe Mairie d'Abobo"),
    (5.4530, -4.0350, "Abobo", "PK 18 / Agbékoi", "Route d'Anyama"),
    (5.4255, -3.9970, "Abobo", "Abobo Baoulé", "Route d'Alépé"),
    (5.3650, -4.0236, "Adjamé", "Forum / Liberté", "Boulevard Nangui Abrogoua"),
    (5.3795, -4.0210, "Adjamé", "Williamsville / Macaci", "Voie Express Adjamé-Abobo"),
    (5.3555, -4.0270, "Adjamé", "Bracodi / Renault", "Avenue Reboul"),
    (5.3235, -4.0211, "Plateau", "Centre Administratif", "Boulevard de la République"),
    (5.3310, -4.0175, "Plateau", "Indénié / Baie de Cocody", "Carrefour de l'Indénié"),
    (5.3185, -4.0160, "Plateau", "Quartier du Commerce", "Avenue Chardy"),
    (5.3025, -3.9828, "Marcory", "Zone 4C / Biétry", "Rue du Canal / Boulevard de Marseille"),
    (5.3125, -3.9860, "Marcory", "Anoumabo / Sicogi", "Boulevard Valéry Giscard d'Estaing"),
    (5.3075, -3.9720, "Marcory", "Marcory Résidentiel / Remblais", "Avenue de Côte d'Ivoire"),
    (5.2946, -3.9472, "Koumassi", "Grand Carrefour / Remblais", "Boulevard du 7 Décembre"),
    (5.3030, -3.9565, "Koumassi", "Prodomo / Campement", "Boulevard du Gabon"),
    (5.2885, -3.9380, "Koumassi", "Quartier Divo / Sicogi", "Rue du Marché de Koumassi"),
    (5.2921, -4.0083, "Treichville", "Zone Portuaire / Belleville", "Boulevard de Marseille"),
    (5.3020, -4.0010, "Treichville", "Avenue 16 / Arras", "Avenue 16 · Carrefour France-Amérique"),
    (5.2568, -3.9261, "Port-Bouët", "Vridi / Zone Industrielle", "Boulevard de Petit-Bassam"),
    (5.2435, -3.8920, "Port-Bouët", "Gonzagueville / Terre Rouge", "Route de Grand-Bassam"),
    (5.2540, -3.9510, "Port-Bouët", "Adjouffou / Aéroport", "Boulevard de l'Aéroport"),
    (5.3396, -4.0419, "Attécoubé", "Agban / Sebroko", "Boulevard de la Paix"),
    (5.3510, -4.0390, "Attécoubé", "Boribana / Banco Baie", "Voie Lagunaire Ouest"),
    (5.3558, -3.8853, "Bingerville", "Bingerville Centre / Feh Kessé", "Boulevard Mitterrand Est"),
    (5.4946, -4.0518, "Anyama", "Anyama Gare / Résidentiel", "Voie Principale d'Anyama"),
    (5.3192, -4.2389, "Songon", "Songon-Agban / Kassemblé", "Route de Dabou · Axe Songon"),
]


def _cle(lat: float, lon: float) -> tuple[float, float]:
    # 4 décimales ≈ 11 m : deux clics proches partagent la même réponse
    return (round(lat, 4), round(lon, 4))


def _repere_local_abidjan(lat: float, lon: float, commune_forcee: str | None = None) -> dict:
    """Identifie le quartier et l'axe de référence les plus proches dans le District d'Abidjan."""
    best = None
    min_d = float("inf")
    # Priorité aux repères de la même commune si connue
    if commune_forcee:
        cf = commune_forcee.strip().lower()
        for r_lat, r_lon, r_com, r_quart, r_rue in _REPERES_ABIDJAN:
            if r_com.lower() == cf:
                d = math.hypot(r_lat - lat, r_lon - lon)
                if d < min_d:
                    min_d = d
                    best = (r_com, r_quart, r_rue)
    if best is None:
        for r_lat, r_lon, r_com, r_quart, r_rue in _REPERES_ABIDJAN:
            d = math.hypot(r_lat - lat, r_lon - lon)
            if d < min_d:
                min_d = d
                best = (r_com, r_quart, r_rue)

    if best is None or min_d > 0.45:
        commune = commune_forcee or "District d'Abidjan"
        return {
            "commune": commune,
            "quartier": None,
            "rue": None,
            "adresse": f"{commune} ({lat:.4f}°N, {lon:.4f}°W)",
        }

    r_com, r_quart, r_rue = best
    commune = commune_forcee or r_com
    # Si le point est très proche du repère (< ~1.8 km), inclure l'axe routier
    if min_d <= 0.016:
        parts = [r_rue, r_quart, commune]
    else:
        parts = [r_quart, commune]
    dedup = []
    for p in parts:
        if p and p not in dedup:
            dedup.append(p)
    return {
        "commune": commune,
        "quartier": r_quart,
        "rue": r_rue if min_d <= 0.016 else None,
        "adresse": ", ".join(dedup),
    }


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


def _formater_adresse(rue: str | None, quartier: str | None, commune: str | None, fallback: str) -> str:
    parts = []
    for p in (rue, quartier, commune):
        if p and p.strip() and p.strip() not in parts:
            parts.append(p.strip())
    return ", ".join(parts) if parts else fallback


def adresse_depuis_coordonnees(lat: float, lon: float) -> dict:
    """Retourne {commune, quartier, rue, adresse}. Ne lève jamais."""
    global _last_call
    cle = _cle(lat, lon)
    now = time.monotonic()

    with _lock:
        hit = _cache.get(cle)
        if hit and now - hit[0] < CACHE_TTL_S:
            return hit[1]

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
                extrait = _extraire(json.loads(resp.read().decode("utf-8")))
        except (urllib.error.URLError, TimeoutError, ValueError, OSError):
            return _repere_local_abidjan(lat, lon)

        local_fb = _repere_local_abidjan(lat, lon, extrait.get("commune"))
        commune = extrait.get("commune") or local_fb["commune"]
        quartier = extrait.get("quartier") or local_fb["quartier"]
        rue = extrait.get("rue") or local_fb["rue"]
        resultat = {
            "commune": commune,
            "quartier": quartier,
            "rue": rue,
            "adresse": _formater_adresse(rue, quartier, commune, local_fb["adresse"]),
        }

        if len(_cache) >= CACHE_MAX:
            _cache.pop(next(iter(_cache)))
        _cache[cle] = (time.monotonic(), resultat)
        return resultat


def _enrichir_cache_arriere_plan(lat: float, lon: float) -> None:
    cle = _cle(lat, lon)
    try:
        adresse_depuis_coordonnees(lat, lon)
    finally:
        with _lock:
            _pending_bg.discard(cle)


def resoudre_adresse_rapide(
    lat: float | None,
    lon: float | None,
    commune_postgis: str | None = None,
) -> dict:
    """Résout immédiatement {commune, quartier, rue, adresse} sans bloquer les listes API.

    Utilise le cache Nominatim s'il est chaud, sinon retourne immédiatement le repère local
    d'Abidjan et lance la requête Nominatim en tâche de fond pour les appels suivants.
    """
    if lat is None or lon is None:
        commune = commune_postgis or "District d'Abidjan"
        return {"commune": commune, "quartier": None, "rue": None, "adresse": commune}

    cle = _cle(lat, lon)
    now = time.monotonic()
    hit = None
    launch_bg = False

    with _lock:
        cached = _cache.get(cle)
        if cached and now - cached[0] < CACHE_TTL_S:
            hit = cached[1]
        elif cle not in _pending_bg and len(_pending_bg) < 25:
            _pending_bg.add(cle)
            launch_bg = True

    if launch_bg:
        t = threading.Thread(target=_enrichir_cache_arriere_plan, args=(lat, lon), daemon=True)
        t.start()

    local_fb = _repere_local_abidjan(lat, lon, commune_postgis)
    if hit:
        commune = commune_postgis or hit.get("commune") or local_fb["commune"]
        quartier = hit.get("quartier") or local_fb["quartier"]
        rue = hit.get("rue") or local_fb["rue"]
        return {
            "commune": commune,
            "quartier": quartier,
            "rue": rue,
            "adresse": _formater_adresse(rue, quartier, commune, local_fb["adresse"]),
        }

    return local_fb
