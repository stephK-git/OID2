"""Tests géomatiques automatisés — Phase 3 SIG Lot 1 (EPSG:32630, Fisher-Jenks, OSM & WorldPop 100 m)."""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest
from app.core.deps import require_role
from app.models.incident import Incident
from app.models.maille_analyse import MailleAnalyse
from app.models.signalement import Signalement
from app.models.zone import Zone
from app.routers.analyses import (
    api_communes_geojson,
    api_mailles_population_geojson,
    api_metadonnees_sig,
    api_points_chauds,
    api_rapport_retex_pdf,
    api_vulnerabilite,
    api_zones_silencieuses,
)
from app.services.jenks import classify_fisher_jenks
from app.services.utm30n import (
    SRID_UTM30N,
    area_km2_utm30n,
    distance_m_utm30n,
    lonlat_to_utm30n,
    utm30n_to_lonlat,
)
from fastapi import HTTPException
from shapely.geometry import MultiPolygon, Polygon, shape

ROOT_DIR = Path(__file__).resolve().parent.parent
COMMUNES_GEOJSON_PATH = ROOT_DIR / "data" / "geo" / "abidjan_13_communes.geojson"
METADATA_JSON_PATH = ROOT_DIR / "data" / "geo" / "sources_metadata.json"

OFFICIAL_13_COMMUNES = {
    "Abobo",
    "Adjamé",
    "Anyama",
    "Attécoubé",
    "Bingerville",
    "Cocody",
    "Koumassi",
    "Marcory",
    "Plateau",
    "Port-Bouët",
    "Songon",
    "Treichville",
    "Yopougon",
}


def test_utm30n_projection_aller_retour_et_surface_hexagone() -> None:
    """Vérifie la précision submétrique de la projection EPSG:32630 (Abidjan) et des aires."""
    assert SRID_UTM30N == 32630

    # Le Plateau (Abidjan) : ~ -4.0200° E, 5.3250° N
    lon0, lat0 = -4.0200, 5.3250
    e_m, n_m = lonlat_to_utm30n(lon0, lat0)

    # Fuseau UTM 30N : méridien central -3° -> à -4.02° l'abscisse est < 500 000 m (~386 960 m)
    assert 380_000.0 < e_m < 395_000.0
    assert 585_000.0 < n_m < 595_000.0

    lon_back, lat_back = utm30n_to_lonlat(e_m, n_m)
    assert abs(lon_back - lon0) < 1e-9
    assert abs(lat_back - lat0) < 1e-9

    # Hexagone régulier de côté a = 300 m construit en coordonnées métriques UTM 30N
    side_m = 300.0
    expected_area_km2 = (3.0 * math.sqrt(3.0) / 2.0) * (side_m**2) / 1_000_000.0  # ~0.233826859 km²
    hex_lonlat = []
    for k in range(6):
        angle = math.radians(60 * k)
        vx = e_m + side_m * math.cos(angle)
        vy = n_m + side_m * math.sin(angle)
        hex_lonlat.append(utm30n_to_lonlat(vx, vy))
    hex_lonlat.append(hex_lonlat[0])

    poly_wgs84 = Polygon(hex_lonlat)
    computed_area_km2 = area_km2_utm30n(poly_wgs84)
    assert abs(computed_area_km2 - expected_area_km2) < 1e-4

    # Distance euclidienne UTM 30N entre deux sommets opposés = 2 * side_m = 600 m
    p_a = hex_lonlat[0]
    p_b = hex_lonlat[3]
    dist_m = distance_m_utm30n(p_a[0], p_a[1], p_b[0], p_b[1])
    assert abs(dist_m - 600.0) < 0.05


def test_fisher_jenks_discretisation_et_gvf() -> None:
    """Vérifie l'algorithme exact de Fisher-Jenks et la qualité d'ajustement GVF."""
    values = [
        110.0, 125.0, 140.0,
        1_450.0, 1_520.0, 1_600.0,
        8_200.0, 8_450.0, 8_900.0,
        24_000.0, 25_500.0, 26_100.0,
    ]
    res = classify_fisher_jenks(values, k=4, palette_name="YlOrRd_5")
    assert res.k == 4
    assert len(res.breaks) == 5
    assert res.gvf > 0.98
    assert sum(res.counts) == len(values)
    assert res.classes[:3] == [1, 1, 1]
    assert res.classes[-3:] == [4, 4, 4]

    # Cas limites : série vide et série constante
    empty_res = classify_fisher_jenks([], k=5)
    assert empty_res.counts == []

    const_res = classify_fisher_jenks([42.0, 42.0, 42.0], k=5)
    assert const_res.k == 1
    assert const_res.counts == [3]


def test_referentiel_13_communes_abidjan_valide_et_non_rectangulaire() -> None:
    """Garantit que les 13 communes d'Abidjan ont de vraies limites topologiques et WorldPop 100 m."""
    assert COMMUNES_GEOJSON_PATH.exists(), f"Fichier manquant : {COMMUNES_GEOJSON_PATH}"
    assert METADATA_JSON_PATH.exists(), f"Fichier manquant : {METADATA_JSON_PATH}"

    meta = json.loads(METADATA_JSON_PATH.read_text(encoding="utf-8"))
    assert "EPSG:32630" in meta["scr_calcul_metrique"]

    fc = json.loads(COMMUNES_GEOJSON_PATH.read_text(encoding="utf-8"))
    assert fc["type"] == "FeatureCollection"

    features = fc["features"]
    assert len(features) == 13

    names = set()
    total_area_km2 = 0.0
    total_pop = 0.0

    for feat in features:
        props = feat["properties"]
        nom = props["nom"]
        names.add(nom)

        geom = shape(feat["geometry"])
        assert geom.is_valid, f"Géométrie invalide pour {nom}"
        assert isinstance(geom, MultiPolygon), f"{nom} doit être un MultiPolygon"

        # Vérifier qu'aucune commune n'est un rectangle factice à 5 sommets
        total_vertices = sum(len(poly.exterior.coords) for poly in geom.geoms)
        assert total_vertices > 25, f"{nom} n'a que {total_vertices} sommets (suspicion de bbox rectangulaire)"

        area_km2 = float(props["superficie_km2"])
        pop = float(props["population_totale"])
        assert area_km2 > 2.0, f"Superficie aberrante pour {nom}: {area_km2}"
        assert pop > 10_000.0, f"Population WorldPop aberrante pour {nom}: {pop}"

        total_area_km2 += area_km2
        total_pop += pop

    assert names == OFFICIAL_13_COMMUNES
    assert 900.0 <= total_area_km2 <= 1_300.0
    assert 4_500_000.0 <= total_pop <= 6_500_000.0


def test_endpoints_sig_lot1_et_rbac(
    db_session,
    utilisateur_coordinateur,
    utilisateur_enqueteur,
) -> None:
    """Teste les contrôleurs SIG (/metadonnees, /communes, /mailles-population, /retex.pdf) et le RBAC."""
    # Contrôle RBAC : un enquêteur ne peut pas consulter les analyses de coordination (403)
    checker = require_role("coordinateur", "verificateur")
    with pytest.raises(HTTPException) as exc_info:
        checker(user=utilisateur_enqueteur)
    assert exc_info.value.status_code == 403
    assert checker(user=utilisateur_coordinateur) == utilisateur_coordinateur

    z_cocody = Zone(
        nom="Cocody",
        code_adm="CIV-ABJ-COC",
        superficie_km2=132.4,
        population_totale=692_500.0,
        densite_hab_km2=5_230.4,
        source_geom="OpenStreetMap (admin_level=8)",
        geom="SRID=4326;MULTIPOLYGON(((-3.99 5.34, -3.95 5.34, -3.95 5.38, -3.99 5.38, -3.99 5.34)))",
    )
    z_abobo = Zone(
        nom="Abobo",
        code_adm="CIV-ABJ-ABO",
        superficie_km2=90.2,
        population_totale=1_340_000.0,
        densite_hab_km2=14_855.9,
        source_geom="OpenStreetMap (admin_level=8)",
        geom="SRID=4326;MULTIPOLYGON(((-4.05 5.40, -4.00 5.40, -4.00 5.45, -4.05 5.45, -4.05 5.40)))",
    )
    db_session.add_all([z_cocody, z_abobo])
    db_session.flush()

    m1 = MailleAnalyse(
        code_maille="HEX300-001",
        zone_id=z_cocody.id,
        cote_m=300,
        superficie_km2=0.2338,
        population_worldpop=1_450.0,
        densite_hab_km2=6_201.9,
        geom="SRID=4326;POLYGON((-3.98 5.35, -3.977 5.35, -3.977 5.353, -3.98 5.353, -3.98 5.35))",
    )
    m2 = MailleAnalyse(
        code_maille="HEX300-002",
        zone_id=z_abobo.id,
        cote_m=300,
        superficie_km2=0.2338,
        population_worldpop=4_820.0,
        densite_hab_km2=20_615.9,
        geom="SRID=4326;POLYGON((-4.03 5.42, -4.027 5.42, -4.027 5.423, -4.03 5.423, -4.03 5.42))",
    )
    inc1 = Incident(
        reference_publique="INC-SIG-001",
        type="inondation_domicile",
        statut="ouvert",
        score_priorite=85,
        niveau_fiabilite="confirme",
        danger_immediat=True,
        zone_id=z_cocody.id,
        geom="SRID=4326;POINT(-3.978 5.351)",
    )
    inc2 = Incident(
        reference_publique="INC-SIG-002",
        type="rue",
        statut="ouvert",
        score_priorite=70,
        niveau_fiabilite="confirme",
        danger_immediat=False,
        zone_id=z_cocody.id,
        geom="SRID=4326;POINT(-3.9785 5.3512)",
    )
    sigs = [
        Signalement(
            reference_suivi=f"SIG-TEST-{i}",
            type="rue",
            gravite="haute",
            danger_immediat=False,
            statut="confirme",
            geom="SRID=4326;POINT(-3.978 5.351)",
        )
        for i in range(3)
    ]
    db_session.add_all([m1, m2, inc1, inc2, *sigs])
    db_session.commit()

    # 1. Métadonnées méthodologiques SIG
    meta = api_metadonnees_sig(db=db_session, _=utilisateur_coordinateur)
    assert "32630" in meta["scr_calcul"]
    assert meta["couverture_administrative"]["nb_communes"] == 2
    assert meta["maillage_hexagonal"]["nb_mailles_actives"] == 2

    # 2. Communes GeoJSON + Fisher-Jenks
    comm_fc = api_communes_geojson(db=db_session, _=utilisateur_coordinateur)
    assert comm_fc["type"] == "FeatureCollection"
    assert comm_fc["crs_calcul"] == "EPSG:32630"
    assert len(comm_fc["features"]) == 2

    # 3. Mailles hexagonales WorldPop (global + filtré par zone_id)
    mailles_fc = api_mailles_population_geojson(zone_id=None, db=db_session, _=utilisateur_coordinateur)
    assert mailles_fc["total_mailles"] == 2
    assert "Fisher-Jenks" in mailles_fc["classification"]["methode"]

    mailles_cocody = api_mailles_population_geojson(
        zone_id=z_cocody.id,
        db=db_session,
        _=utilisateur_coordinateur,
    )
    assert mailles_cocody["total_mailles"] == 1
    assert mailles_cocody["features"][0]["properties"]["zone_nom"] == "Cocody"

    # 4. Points chauds (2 incidents à < 100 m en UTM 30N -> 1 cluster)
    hotspots = api_points_chauds(db=db_session, _=utilisateur_coordinateur)
    assert len(hotspots) == 1
    assert hotspots[0]["nombre_incidents"] == 2
    assert "utm_e" in hotspots[0]["centre"]

    # 5. Vulnérabilité, Zones silencieuses et RETEX PDF
    vuln = api_vulnerabilite(db=db_session, _=utilisateur_coordinateur)
    assert len(vuln) == 2

    zs = api_zones_silencieuses(db=db_session, _=utilisateur_coordinateur)
    zs_names = [z["zone_nom"] for z in zs]
    assert "Abobo" in zs_names

    pdf_resp = api_rapport_retex_pdf(db=db_session, _=utilisateur_coordinateur)
    assert pdf_resp.media_type == "application/pdf"
    assert bytes(pdf_resp.body).startswith(b"%PDF")
