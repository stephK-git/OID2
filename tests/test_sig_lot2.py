"""Tests géomatiques et géostatistiques automatisés — Phase 3 SIG Lot 2 (DBSCAN, Gi*, A×E×V, Poisson)."""

from __future__ import annotations

import math
from pathlib import Path

from app.models.incident import Incident
from app.models.maille_analyse import MailleAnalyse
from app.models.zone import Zone
from app.routers.analyses import (
    api_getis_ord_gi_star,
    api_mailles_population_geojson,
    api_points_chauds,
    api_rapport_retex_pdf,
    api_vulnerabilite,
    api_zones_silencieuses,
)
from app.services.utm30n import utm30n_to_lonlat
from shapely.geometry import Polygon, shape

ROOT_DIR = Path(__file__).resolve().parent.parent
DEM_HYDRO_NPZ = ROOT_DIR / "data" / "geo" / "abidjan_dem_hydro.npz"
HYDRO_GEOJSON = ROOT_DIR / "data" / "geo" / "abidjan_hydro_lines.geojson"


def _hex_wkt_from_utm(e_center: float, n_center: float, side_m: float = 175.0) -> str:
    """Construit un hexagone régulier EWKT (SRID=4326) centré en coordonnées métriques UTM 30N."""
    pts = []
    for k in range(6):
        ang = math.radians(60 * k)
        lon, lat = utm30n_to_lonlat(e_center + side_m * math.cos(ang), n_center + side_m * math.sin(ang))
        pts.append(f"{lon:.7f} {lat:.7f}")
    pts.append(pts[0])
    return f"SRID=4326;POLYGON(({', '.join(pts)}))"


def _point_wkt_from_utm(e_m: float, n_m: float) -> str:
    lon, lat = utm30n_to_lonlat(e_m, n_m)
    return f"SRID=4326;POINT({lon:.7f} {lat:.7f})"


def test_fichiers_referentiels_mnt_et_hydrographie_presents() -> None:
    """Vérifie la présence des référentiels physiques Lot 2 (MNT + réseau hydrographique OSM)."""
    assert DEM_HYDRO_NPZ.exists(), f"Grille MNT/Hydro manquante : {DEM_HYDRO_NPZ}"
    assert HYDRO_GEOJSON.exists(), f"Réseau hydrographique OSM manquant : {HYDRO_GEOJSON}"


def test_dbscan_concave_hull_filtre_bruit_et_elimine_cercle_600m(
    db_session,
    utilisateur_coordinateur,
) -> None:
    """Vérifie que DBSCAN filtre un point isolé (bruit) et produit un corridor organique bien inférieur au cercle 600 m."""
    e0, n0 = 388_000.0, 591_000.0
    # 3 incidents alignés le long d'un talweg de 360 m (< eps=450 m entre voisins)
    inc_corridor = [
        Incident(
            reference_publique=f"INC-DBSCAN-{i}",
            type="inondation_domicile",
            statut="ouvert",
            score_priorite=82,
            niveau_fiabilite="confirme",
            danger_immediat=(i == 0),
            geom=_point_wkt_from_utm(e0 + i * 180.0, n0 + i * 35.0),
        )
        for i in range(3)
    ]
    # 1 incident isolé à 1 800 m -> doit être classé comme bruit DBSCAN (non agrégé)
    inc_bruit = Incident(
        reference_publique="INC-BRUIT-ISOLE",
        type="rue",
        statut="ouvert",
        score_priorite=90,
        niveau_fiabilite="confirme",
        danger_immediat=True,
        geom=_point_wkt_from_utm(e0 + 1_800.0, n0 + 1_800.0),
    )
    db_session.add_all([*inc_corridor, inc_bruit])
    db_session.commit()

    clusters = api_points_chauds(eps_m=450.0, min_points=2, db=db_session, _=utilisateur_coordinateur)
    assert len(clusters) == 1, "Le point isolé à 1,8 km ne doit pas former de cluster DBSCAN"

    cl = clusters[0]
    assert cl["nombre_incidents"] == 3
    assert inc_bruit.id not in cl["incidents_associes"]
    assert "ST_ClusterDBSCAN" in cl["algorithme"]

    hull = shape(cl["emprise_geojson"])
    assert hull.is_valid
    assert isinstance(hull, Polygon)

    # Un disque fixe de 600 m aurait une surface pi * 0.6^2 = 1.131 km².
    # Le corridor concave tamponné à 65 m autour d'un segment de 360 m fait ~ 0.06 km² (< 0.15 km²).
    assert 0.01 < cl["superficie_cluster_km2"] < 0.18


def test_getis_ord_gi_star_hotspot_significatif_et_cas_neutre(
    db_session,
    utilisateur_coordinateur,
) -> None:
    """Vérifie le calcul exact du z-score et de la p-value Getis-Ord Gi* sur une grille de 25 hexagones."""
    z = Zone(
        nom="Koumassi",
        code_adm="CIV-ABJ-KOU",
        superficie_km2=12.0,
        population_totale=420_000.0,
        densite_hab_km2=35_000.0,
        geom="SRID=4326;MULTIPOLYGON(((-3.98 5.28, -3.93 5.28, -3.93 5.32, -3.98 5.32, -3.98 5.28)))",
    )
    db_session.add(z)
    db_session.flush()

    e_base, n_base = 392_000.0, 586_000.0
    mailles = []
    idx = 0
    for row in range(5):
        for col in range(5):
            idx += 1
            mailles.append(
                MailleAnalyse(
                    code_maille=f"HEX-GI-{idx:02d}",
                    zone_id=z.id,
                    cote_m=300,
                    superficie_km2=0.2338,
                    population_worldpop=1_500.0,
                    densite_hab_km2=6_415.0,
                    dist_hydro_m=180.0,
                    altitude_moy_m=6.0,
                    indice_alea=75.0,
                    geom=_hex_wkt_from_utm(e_base + col * 380.0, n_base + row * 380.0),
                )
            )
    db_session.add_all(mailles)
    db_session.commit()

    # 1. Sans aucun sinistre : écart-type nul -> tous les z-scores valent 0.0
    gi_empty = api_getis_ord_gi_star(rayon_voisinage_m=600.0, zone_id=None, db=db_session, _=utilisateur_coordinateur)
    assert gi_empty["resume"]["z_max"] == 0.0
    assert gi_empty["resume"]["nb_hotspots_99"] == 0

    # 2. Concentration de sinistres au coeur de la grille (row=2, col=2 et voisins directs)
    foyer_coords = [
        (e_base + 2 * 380.0, n_base + 2 * 380.0),
        (e_base + 2 * 380.0, n_base + 2 * 380.0),
        (e_base + 3 * 380.0, n_base + 2 * 380.0),
        (e_base + 2 * 380.0, n_base + 3 * 380.0),
    ]
    for k, (ex, ny) in enumerate(foyer_coords):
        db_session.add(
            Incident(
                reference_publique=f"INC-GI-{k}",
                type="inondation_domicile",
                statut="ouvert",
                score_priorite=90,
                niveau_fiabilite="confirme",
                danger_immediat=True,
                zone_id=z.id,
                geom=_point_wkt_from_utm(ex, ny),
            )
        )
    db_session.commit()

    gi_res = api_getis_ord_gi_star(rayon_voisinage_m=600.0, zone_id=None, db=db_session, _=utilisateur_coordinateur)
    assert gi_res["resume"]["z_max"] >= 2.58
    assert gi_res["resume"]["nb_hotspots_99"] >= 1

    # La maille centrale (idx=13 -> HEX-GI-13) doit être un point chaud significatif (p < 0.01)
    by_code = {f["properties"]["code_maille"]: f["properties"] for f in gi_res["features"]}
    assert by_code["HEX-GI-13"]["z_score"] >= 2.58
    assert by_code["HEX-GI-13"]["p_value"] < 0.01
    # Coin éloigné (HEX-GI-01) sans sinistre dans son voisinage -> z_score négatif
    assert by_code["HEX-GI-01"]["z_score"] < 0.0


def test_indice_multicritere_a_e_v_et_modele_poisson_zones_silencieuses(
    db_session,
    utilisateur_coordinateur,
) -> None:
    """Teste la hiérarchie physique A×E×V, les 3 thématiques hexagonales et la détection Poisson (même si O_i = 1)."""
    # Commune 1 : Bas-fond lagunaire très peuplé (Aléa fort, Exposition forte) mais seulement O_1 = 1 remontée !
    z_bas_fond = Zone(
        nom="Bas-Fond Dense",
        code_adm="CIV-ABJ-BF1",
        superficie_km2=25.0,
        population_totale=900_000.0,
        densite_hab_km2=36_000.0,
        geom="SRID=4326;MULTIPOLYGON(((-4.02 5.30, -3.98 5.30, -3.98 5.33, -4.02 5.33, -4.02 5.30)))",
    )
    # Commune 2 : Plateau élevé moins exposé, mais qui concentre O_2 = 18 incidents signalés
    z_plateau = Zone(
        nom="Plateau Haut",
        code_adm="CIV-ABJ-PL2",
        superficie_km2=40.0,
        population_totale=150_000.0,
        densite_hab_km2=3_750.0,
        geom="SRID=4326;MULTIPOLYGON(((-4.02 5.40, -3.98 5.40, -3.98 5.44, -4.02 5.44, -4.02 5.40)))",
    )
    # Commune 3 : Réserve forestière inhabitée (Exposition nulle -> IV = 0)
    z_foret = Zone(
        nom="Forêt du Banco",
        code_adm="CIV-ABJ-BAN",
        superficie_km2=34.0,
        population_totale=0.0,
        densite_hab_km2=0.0,
        geom="SRID=4326;MULTIPOLYGON(((-4.08 5.37, -4.04 5.37, -4.04 5.41, -4.08 5.41, -4.08 5.37)))",
    )
    db_session.add_all([z_bas_fond, z_plateau, z_foret])
    db_session.flush()

    db_session.add_all(
        [
            MailleAnalyse(
                code_maille="HEX-BF-01",
                zone_id=z_bas_fond.id,
                cote_m=300,
                superficie_km2=0.2338,
                population_worldpop=8_500.0,
                densite_hab_km2=36_355.0,
                dist_hydro_m=35.0,
                altitude_moy_m=3.2,
                indice_alea=92.0,
                geom="SRID=4326;POLYGON((-4.01 5.31, -4.007 5.31, -4.007 5.313, -4.01 5.313, -4.01 5.31))",
            ),
            MailleAnalyse(
                code_maille="HEX-PL-01",
                zone_id=z_plateau.id,
                cote_m=300,
                superficie_km2=0.2338,
                population_worldpop=900.0,
                densite_hab_km2=3_849.0,
                dist_hydro_m=1_950.0,
                altitude_moy_m=88.0,
                indice_alea=20.0,
                geom="SRID=4326;POLYGON((-4.01 5.41, -4.007 5.41, -4.007 5.413, -4.01 5.413, -4.01 5.41))",
            ),
            MailleAnalyse(
                code_maille="HEX-FO-01",
                zone_id=z_foret.id,
                cote_m=300,
                superficie_km2=0.2338,
                population_worldpop=0.0,
                densite_hab_km2=0.0,
                dist_hydro_m=400.0,
                altitude_moy_m=45.0,
                indice_alea=48.0,
                geom="SRID=4326;POLYGON((-4.06 5.38, -4.057 5.38, -4.057 5.383, -4.06 5.383, -4.06 5.38))",
            ),
        ]
    )

    # 1 seul incident dans Bas-Fond Dense (O_1 = 1 alors que son poids Population * Aléa est > 95 % du total !)
    db_session.add(
        Incident(
            reference_publique="INC-BF-UNIQUE",
            type="inondation_domicile",
            statut="ouvert",
            score_priorite=75,
            niveau_fiabilite="confirme",
            danger_immediat=False,
            zone_id=z_bas_fond.id,
            geom="SRID=4326;POINT(-4.008 5.311)",
        )
    )
    # 18 incidents sur Plateau Haut
    for i in range(18):
        db_session.add(
            Incident(
                reference_publique=f"INC-PL-{i:02d}",
                type="rue",
                statut="ouvert",
                score_priorite=55,
                niveau_fiabilite="confirme",
                danger_immediat=False,
                zone_id=z_plateau.id,
                geom="SRID=4326;POINT(-4.008 5.411)",
            )
        )
    db_session.commit()

    # 1. Vérification des 3 thématiques hexagonales (densite, alea, vulnerabilite)
    for th in ("densite", "alea", "vulnerabilite"):
        fc_hex = api_mailles_population_geojson(
            zone_id=None,
            thematique=th,
            db=db_session,
            _=utilisateur_coordinateur,
        )
        assert fc_hex["thematique"] == th
        assert fc_hex["total_mailles"] == 3
        assert len(fc_hex["classification"]["breaks"]) >= 2

    # 2. Vérification de l'indice multicritère A × E × V
    vulns = api_vulnerabilite(db=db_session, _=utilisateur_coordinateur)
    by_nom = {v["zone_nom"]: v for v in vulns}

    assert by_nom["Forêt du Banco"]["indice_vulnerabilite"] == 0.0
    assert by_nom["Bas-Fond Dense"]["score_alea"] > by_nom["Plateau Haut"]["score_alea"]
    assert by_nom["Bas-Fond Dense"]["score_exposition"] > by_nom["Plateau Haut"]["score_exposition"]
    assert by_nom["Bas-Fond Dense"]["indice_vulnerabilite"] > by_nom["Plateau Haut"]["indice_vulnerabilite"]
    assert 0.0 <= by_nom["Bas-Fond Dense"]["jenks_gvf"] <= 1.0

    # 3. Vérification du modèle de Poisson Observé / Attendu :
    # Bas-Fond Dense a O_1 = 1 (> 0 !), mais E_1 >> 10 -> doit être détecté en sous-signalement sévère !
    zs = api_zones_silencieuses(db=db_session, _=utilisateur_coordinateur)
    zs_by_nom = {z["zone_nom"]: z for z in zs}
    assert "Bas-Fond Dense" in zs_by_nom
    bf_alert = zs_by_nom["Bas-Fond Dense"]
    assert bf_alert["observe"] == 1
    assert bf_alert["attendu"] > 12.0
    assert bf_alert["residu_poisson"] < -3.0
    assert bf_alert["p_value_poisson"] < 0.001
    assert bf_alert["niveau_severite"] == "haute"

    # 4. Vérification du rapport RETEX PDF complet Lot 2
    pdf_resp = api_rapport_retex_pdf(db=db_session, _=utilisateur_coordinateur)
    assert pdf_resp.media_type == "application/pdf"
    pdf_bytes = bytes(pdf_resp.body)
    assert pdf_bytes.startswith(b"%PDF")
    assert len(pdf_bytes) > 2_500

