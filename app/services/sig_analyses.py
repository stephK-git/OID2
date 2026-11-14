"""Moteur d'analyse spatiale géomatique complet (Phase 3 SIG — Lots 1 & 2 — O.I.D).

Implémente les 6 piliers géomatiques validés :
1. Limites administratives réelles des 13 communes du District Autonome d'Abidjan (OSM / OCHA COD-AB).
2. Démographie carroyée WorldPop 100 m agrégée sur maillage hexagonal PostGIS `ST_HexagonGrid` (300 m).
3. Clustering métrique déterministe `ST_ClusterDBSCAN` + enveloppes organiques `ST_ConcaveHull`
   (zéro cercle arbitraire de 600 m) et autocorrélation spatiale locale de Getis-Ord Gi* (z-score / p-value).
4. Indice multicritère documenté (Risque = Aléa^0.40 * Exposition^0.35 * Vulnérabilité^0.25) adossé
   au MNT et au réseau hydrographique en EPSG:32630, discrétisé par Fisher-Jenks (avec GVF).
5. Détection des zones silencieuses par modèle de Poisson Observé / Attendu (résidu de déviance r_D).
6. Tous les calculs métriques en projection officielle WGS 84 / UTM zone 30N (EPSG:32630).
"""

from __future__ import annotations

import contextlib
import io
import json
import math
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import shapely
from geoalchemy2.shape import to_shape
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from shapely import STRtree, points
from shapely.geometry import MultiPoint, MultiPolygon, Polygon, mapping, shape
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.models.evaluation import Evaluation
from app.models.incident import Incident
from app.models.maille_analyse import MailleAnalyse
from app.models.signalement import Signalement
from app.models.zone import Zone
from app.services.jenks import classify_fisher_jenks
from app.services.utm30n import (
    SRID_UTM30N,
    area_km2_utm30n,
    distance_m_utm30n,
    geom_to_wgs84,
    lonlat_to_utm30n,
    utm30n_to_lonlat,
)

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
METADATA_JSON_PATH = ROOT_DIR / "data" / "geo" / "sources_metadata.json"


def _round_geojson_coords(geom_dict: dict[str, Any], precision: int = 5) -> dict[str, Any]:
    """Arrondit les coordonnées GeoJSON (5 décimales ≈ 1,1 m) pour optimiser le transfert réseau."""

    def _round_rec(coords):
        if isinstance(coords, (list, tuple)):
            if coords and isinstance(coords[0], (int, float)):
                return [round(float(c), precision) for c in coords]
            return [_round_rec(c) for c in coords]
        return coords

    return {"type": geom_dict["type"], "coordinates": _round_rec(geom_dict["coordinates"])}


def _poisson_cdf_left(k_obs: int, lam: float) -> float:
    """Probabilité cumulée unilatérale gauche P(X <= k_obs) pour X ~ Poisson(lam)."""
    if lam <= 0.0:
        return 1.0
    if k_obs < 0:
        return 0.0
    # Somme en log-espace pour stabilité numérique quel que soit lam
    log_lam = math.log(lam)
    total = 0.0
    for k in range(k_obs + 1):
        log_pmf = -lam + k * log_lam - math.lgamma(k + 1)
        total += math.exp(log_pmf)
    return min(1.0, max(0.0, total))


def _poisson_deviance_residual(obs: float, exp: float) -> float:
    """Résidu de déviance signé de Poisson r_D = sgn(O - E) * sqrt(2 * [O * ln(O/E) - (O - E)])."""
    if exp <= 1e-9:
        return 0.0
    if obs <= 0.0:
        return -math.sqrt(2.0 * exp)
    term = obs * math.log(obs / exp) - (obs - exp)
    val = math.sqrt(max(0.0, 2.0 * term))
    return val if obs >= exp else -val


def obtenir_metadonnees_sig(db: Session) -> dict[str, Any]:
    """Retourne la fiche méthodologique complète et les métadonnées géomatiques actives (Lots 1 & 2)."""
    file_meta: dict[str, Any] = {}
    if METADATA_JSON_PATH.exists():
        try:
            file_meta = json.loads(METADATA_JSON_PATH.read_text(encoding="utf-8"))
        except Exception:
            file_meta = {}

    nb_communes = db.scalar(select(func.count(Zone.id))) or 0
    nb_mailles = db.scalar(select(func.count(MailleAnalyse.id))) or 0
    sup_totale = db.scalar(select(func.coalesce(func.sum(Zone.superficie_km2), 0.0))) or 0.0
    pop_totale = db.scalar(select(func.coalesce(func.sum(Zone.population_totale), 0.0))) or 0.0
    alt_min = db.scalar(select(func.min(MailleAnalyse.altitude_moy_m)))
    alt_max = db.scalar(select(func.max(MailleAnalyse.altitude_moy_m)))
    alea_moy = db.scalar(select(func.avg(MailleAnalyse.indice_alea)))

    return {
        "territoire": file_meta.get("territoire", "District Autonome d'Abidjan (13 communes)"),
        "scr_stockage": "EPSG:4326 (WGS 84)",
        "scr_calcul": f"EPSG:{SRID_UTM30N} (WGS 84 / UTM zone 30N)",
        "unite_metrique": "mètre (m) / kilomètre carré (km²)",
        "discretisation": "Seuils naturels de Fisher-Jenks (minimisation variance intra-classe, GVF)",
        "maillage_hexagonal": {
            "methode": "PostGIS ST_HexagonGrid en projection UTM 30N (EPSG:32630)",
            "cote_m": 300,
            "superficie_unitaire_km2": 0.2338,
            "nb_mailles_actives": int(nb_mailles),
            "altitude_min_m": round(float(alt_min), 1) if alt_min is not None else 0.0,
            "altitude_max_m": round(float(alt_max), 1) if alt_max is not None else 0.0,
            "indice_alea_moyen": round(float(alea_moy), 1) if alea_moy is not None else 0.0,
        },
        "couverture_administrative": {
            "nb_communes": int(nb_communes),
            "superficie_totale_km2": round(float(sup_totale), 2),
            "population_totale_worldpop": round(float(pop_totale), 0),
            "source_limites": "OpenStreetMap (admin_level=8, ODbL) & OCHA COD-AB Côte d'Ivoire",
            "source_population": "WorldPop 2020 UN-adjusted Population Counts (résolution 100 m, CC-BY 4.0)",
            "source_hydrographie": "OpenStreetMap (waterway=river|stream|canal|drain + berges Lagune Ébrié)",
            "source_mnt": "AWS Open Terrain / SRTM-Copernicus DEM (~38 m, agrégé par hexagone 300 m)",
        },
        "methodes_lot2": {
            "clustering": "PostGIS ST_ClusterDBSCAN (eps=450 m, minpoints=2) + ST_ConcaveHull (0.80) en EPSG:32630",
            "autocorrelation": "Getis-Ord Gi* local (voisinage euclidien d <= 900 m en EPSG:32630, test bilatéral)",
            "vulnerabilite": "IV = 100 * (Aléa^0.40 * Exposition^0.35 * Vulnérabilité^0.25) — classes de Fisher-Jenks",
            "zones_silencieuses": "Modèle de Poisson Observé / Attendu (E_i prop. Pop_exposée * Aléa, résidu r_D)",
        },
        "maj_referentiel": file_meta.get("genere_le"),
    }


def obtenir_communes_geojson(db: Session) -> dict[str, Any]:
    """Retourne le FeatureCollection GeoJSON des 13 communes réelles avec démographie WorldPop et Jenks."""
    zones = db.scalars(select(Zone).order_by(Zone.nom)).all()
    incidents = db.scalars(select(Incident)).all()

    inc_by_zone: dict[int, list[Incident]] = {}
    for inc in incidents:
        if inc.zone_id is not None:
            inc_by_zone.setdefault(inc.zone_id, []).append(inc)

    raw_items: list[dict[str, Any]] = []
    densites: list[float] = []

    for z in zones:
        geom_json = None
        centre = None
        calc_area = z.superficie_km2
        if z.geom is not None:
            try:
                sh_geom = to_shape(z.geom)
                geom_json = _round_geojson_coords(mapping(sh_geom), 5)
                c = sh_geom.centroid
                e_m, n_m = lonlat_to_utm30n(c.x, c.y)
                centre = {
                    "lat": round(c.y, 6),
                    "lon": round(c.x, 6),
                    "utm_e": round(e_m, 1),
                    "utm_n": round(n_m, 1),
                }
                if not calc_area or calc_area <= 0:
                    calc_area = round(area_km2_utm30n(sh_geom), 3)
            except Exception:
                geom_json = None

        sup_km2 = round(float(calc_area or 0.0), 3)
        pop = round(float(z.population_totale or 0.0), 0)
        dens = round(
            float(
                z.densite_hab_km2
                if z.densite_hab_km2 is not None
                else (pop / sup_km2 if sup_km2 > 0 else 0.0)
            ),
            1,
        )
        z_incs = inc_by_zone.get(z.id, [])
        nb_inc = len(z_incs)
        nb_dng = sum(1 for i in z_incs if i.danger_immediat)
        taux_100k = round((nb_inc / pop) * 100000.0, 2) if pop > 0 else 0.0

        densites.append(dens)
        raw_items.append(
            {
                "zone_id": z.id,
                "nom": z.nom,
                "code_adm": z.code_adm or f"CIV-ABJ-{z.id:03d}",
                "superficie_km2": sup_km2,
                "population_totale": pop,
                "densite_hab_km2": dens,
                "nombre_incidents": nb_inc,
                "dangers_immediats": nb_dng,
                "incidents_pour_100k_hab": taux_100k,
                "source_geom": z.source_geom or "OpenStreetMap / OCHA COD-AB",
                "centre": centre,
                "geometry": geom_json,
            }
        )

    jenks = (
        classify_fisher_jenks(densites, k=5, palette_name="PuBuGn_5")
        if densites
        else classify_fisher_jenks([], k=5)
    )
    features = []
    for idx, item in enumerate(raw_items):
        geom_json = item.pop("geometry")
        if geom_json is None:
            continue
        cls_idx = jenks.classes[idx] if idx < len(jenks.classes) else 1
        color = jenks.palette[cls_idx - 1] if jenks.palette else "#67a9cf"
        item["classe_jenks"] = cls_idx
        item["couleur_densite"] = color
        features.append(
            {
                "type": "Feature",
                "properties": item,
                "geometry": geom_json,
            }
        )

    return {
        "type": "FeatureCollection",
        "crs_calcul": f"EPSG:{SRID_UTM30N}",
        "classification": {
            "variable": "densite_hab_km2",
            "unite": "hab./km²",
            "methode": "Fisher-Jenks",
            "k": jenks.k,
            "breaks": jenks.breaks,
            "counts": jenks.counts,
            "gvf": jenks.gvf,
            "palette": jenks.palette,
        },
        "features": features,
    }


def _load_hex_rows(db: Session, zone_id: int | None = None) -> list[dict[str, Any]]:
    """Charge les mailles hexagonales 300 m (PostgreSQL ST_AsGeoJSON rapide ou repli SQLite)."""
    dialect = db.bind.dialect.name if db.bind is not None else "sqlite"
    rows_parsed: list[dict[str, Any]] = []

    if dialect == "postgresql":
        where_clause = "WHERE m.zone_id = :zid" if zone_id is not None else ""
        sql = text(
            f"""
            SELECT
                m.id,
                m.code_maille,
                m.zone_id,
                COALESCE(z.nom, 'Non rattaché') AS zone_nom,
                m.cote_m,
                m.superficie_km2,
                m.population_worldpop,
                m.densite_hab_km2,
                m.dist_hydro_m,
                m.altitude_moy_m,
                m.indice_alea,
                ST_AsGeoJSON(m.geom, 5) AS gj
            FROM maille_analyse m
            LEFT JOIN zone z ON z.id = m.zone_id
            {where_clause}
            ORDER BY m.id
            """
        )
        params = {"zid": zone_id} if zone_id is not None else {}
        for r in db.execute(sql, params).mappings():
            rows_parsed.append(
                {
                    "id": int(r["id"]),
                    "code_maille": r["code_maille"],
                    "zone_id": r["zone_id"],
                    "zone_nom": r["zone_nom"],
                    "cote_m": int(r["cote_m"]),
                    "superficie_km2": round(float(r["superficie_km2"]), 4),
                    "population_worldpop": round(float(r["population_worldpop"]), 1),
                    "densite_hab_km2": round(float(r["densite_hab_km2"]), 1),
                    "dist_hydro_m": round(float(r["dist_hydro_m"]), 1) if r["dist_hydro_m"] is not None else 500.0,
                    "altitude_moy_m": round(float(r["altitude_moy_m"]), 1) if r["altitude_moy_m"] is not None else 25.0,
                    "indice_alea": round(float(r["indice_alea"]), 1) if r["indice_alea"] is not None else 40.0,
                    "geometry": json.loads(r["gj"]),
                }
            )
    else:
        zone_names = {z.id: z.nom for z in db.scalars(select(Zone)).all()}
        stmt = select(MailleAnalyse).order_by(MailleAnalyse.id)
        if zone_id is not None:
            stmt = stmt.where(MailleAnalyse.zone_id == zone_id)
        for m in db.scalars(stmt).all():
            if m.geom is None:
                continue
            try:
                gj = _round_geojson_coords(mapping(to_shape(m.geom)), 5)
            except Exception:
                continue
            rows_parsed.append(
                {
                    "id": m.id,
                    "code_maille": m.code_maille,
                    "zone_id": m.zone_id,
                    "zone_nom": zone_names.get(m.zone_id or -1, "Non rattaché"),
                    "cote_m": m.cote_m,
                    "superficie_km2": round(float(m.superficie_km2), 4),
                    "population_worldpop": round(float(m.population_worldpop), 1),
                    "densite_hab_km2": round(float(m.densite_hab_km2), 1),
                    "dist_hydro_m": round(float(m.dist_hydro_m), 1) if m.dist_hydro_m is not None else 500.0,
                    "altitude_moy_m": round(float(m.altitude_moy_m), 1) if m.altitude_moy_m is not None else 25.0,
                    "indice_alea": round(float(m.indice_alea), 1) if m.indice_alea is not None else 40.0,
                    "geometry": gj,
                }
            )
    return rows_parsed


def obtenir_mailles_population_geojson(
    db: Session,
    zone_id: int | None = None,
    thematique: str = "densite",
) -> dict[str, Any]:
    """Retourne le maillage hexagonal 300 m (EPSG:32630) selon la thématique choisie + Fisher-Jenks."""
    rows_parsed = _load_hex_rows(db, zone_id=zone_id)
    if not rows_parsed:
        return {
            "type": "FeatureCollection",
            "crs_calcul": f"EPSG:{SRID_UTM30N}",
            "zone_filtree_id": zone_id,
            "thematique": thematique,
            "total_mailles": 0,
            "population_couverte": 0.0,
            "classification": {
                "variable": "densite_hab_km2",
                "unite": "hab./km²",
                "methode": "Seuils naturels de Fisher-Jenks",
                "k": 0,
                "breaks": [],
                "counts": [],
                "gvf": 1.0,
                "palette": [],
            },
            "features": [],
        }

    dens_vals = np.array([r["densite_hab_km2"] for r in rows_parsed], dtype=np.float64)
    alea_vals = np.array([r["indice_alea"] for r in rows_parsed], dtype=np.float64)
    dist_vals = np.array([r["dist_hydro_m"] for r in rows_parsed], dtype=np.float64)

    # Calcul vectorisé de l'indice multicritère local par maille : IV_m = 100 * (A^0.40 * E^0.35 * V^0.25)
    pos_dens = dens_vals[dens_vals > 0.0]
    p98_dens = float(np.percentile(pos_dens, 98.0)) if pos_dens.size > 0 else 1.0
    denom_log = max(math.log1p(p98_dens), 1.0)

    a_norm = np.clip(alea_vals / 100.0, 0.02, 1.0)
    e_norm = np.where(dens_vals > 0.0, np.clip(np.log1p(dens_vals) / denom_log, 0.0, 1.0), 0.0)
    v_norm = np.where(
        dens_vals > 0.0,
        np.clip(0.55 * e_norm + 0.45 * np.exp(-dist_vals / 500.0), 0.05, 1.0),
        0.0,
    )
    vuln_maille_vals = np.round(100.0 * (a_norm**0.40) * (e_norm**0.35) * (v_norm**0.25), 1)

    for idx, r in enumerate(rows_parsed):
        r["indice_vulnerabilite_maille"] = float(vuln_maille_vals[idx])

    if thematique == "alea":
        target_vals = alea_vals
        var_name = "indice_alea"
        unite = "/ 100"
        methode_label = "Seuils naturels de Fisher-Jenks — Aléa physique (MNT + Hydrographie EPSG:32630)"
        palette_key = "PuBuGn_5"
        positive_only = False
    elif thematique == "vulnerabilite":
        target_vals = vuln_maille_vals
        var_name = "indice_vulnerabilite_maille"
        unite = "/ 100"
        methode_label = "Seuils naturels de Fisher-Jenks — Risque Multicritère (Aléa × Exposition × Vulnérabilité)"
        palette_key = "YlOrRd_5"
        positive_only = True
    else:
        target_vals = dens_vals
        var_name = "densite_hab_km2"
        unite = "hab./km²"
        methode_label = "Seuils naturels de Fisher-Jenks (WorldPop 100 m sur hexagones 300 m)"
        palette_key = "YlOrRd_5"
        positive_only = True

    pos_subset = target_vals[target_vals > 0.0]
    if positive_only and pos_subset.size >= 5:
        jenks_pos = classify_fisher_jenks(pos_subset, k=5, palette_name=palette_key)
        breaks = [0.0] + jenks_pos.breaks[1:]
        inner = np.asarray(breaks[1:-1], dtype=np.float64)
        classes_all = np.clip(np.searchsorted(inner, target_vals, side="left") + 1, 1, jenks_pos.k).tolist()
        counts = [int(np.sum(np.asarray(classes_all) == c)) for c in range(1, jenks_pos.k + 1)]
        palette = jenks_pos.palette
        gvf = jenks_pos.gvf
        k_eff = jenks_pos.k
    else:
        jenks_all = classify_fisher_jenks(target_vals, k=5, palette_name=palette_key)
        breaks = jenks_all.breaks
        classes_all = jenks_all.classes
        counts = jenks_all.counts
        palette = jenks_all.palette
        gvf = jenks_all.gvf
        k_eff = jenks_all.k

    features = []
    total_pop = 0.0
    for idx, r in enumerate(rows_parsed):
        geom = r.pop("geometry")
        c_idx = classes_all[idx] if idx < len(classes_all) else 1
        r["classe_jenks"] = c_idx
        r["couleur"] = palette[c_idx - 1] if palette else "#ffffb2"
        total_pop += r["population_worldpop"]
        features.append(
            {
                "type": "Feature",
                "properties": r,
                "geometry": geom,
            }
        )

    return {
        "type": "FeatureCollection",
        "crs_calcul": f"EPSG:{SRID_UTM30N}",
        "zone_filtree_id": zone_id,
        "thematique": thematique,
        "total_mailles": len(features),
        "population_couverte": round(total_pop, 0),
        "classification": {
            "variable": var_name,
            "unite": unite,
            "methode": methode_label,
            "k": k_eff,
            "breaks": [round(float(b), 1) for b in breaks],
            "counts": counts,
            "gvf": gvf,
            "palette": palette,
        },
        "features": features,
    }


def _collect_active_sinisters(db: Session) -> list[dict[str, Any]]:
    """Collecte les incidents qualifiés et signalements actifs (non rejetés) projetés en EPSG:32630."""
    items: list[dict[str, Any]] = []
    incidents = db.scalars(select(Incident)).all()
    for inc in incidents:
        if inc.geom is None:
            continue
        try:
            pt = to_shape(inc.geom)
            e_m, n_m = lonlat_to_utm30n(pt.x, pt.y)
            prio = float(inc.score_priorite or 50.0)
            items.append(
                {
                    "kind": "incident",
                    "id": inc.id,
                    "zone_id": inc.zone_id,
                    "ref": inc.reference_publique,
                    "type": inc.type,
                    "lat": float(pt.y),
                    "lon": float(pt.x),
                    "utm_e": float(e_m),
                    "utm_n": float(n_m),
                    "priorite": prio,
                    "danger_immediat": bool(inc.danger_immediat),
                    "hauteur_eau_cm": 0.0,
                    "weight": 1.0 + (prio / 100.0) + (0.5 if inc.danger_immediat else 0.0),
                }
            )
        except Exception:
            continue

    sigs = db.scalars(select(Signalement).where(Signalement.statut != "rejete")).all()
    for sig in sigs:
        if sig.geom is None:
            continue
        try:
            pt = to_shape(sig.geom)
            e_m, n_m = lonlat_to_utm30n(pt.x, pt.y)
            h_cm = float(sig.hauteur_eau_cm or 30.0)
            items.append(
                {
                    "kind": "signalement",
                    "id": sig.id,
                    "incident_id": sig.incident_id,
                    "zone_id": None,
                    "ref": sig.reference_suivi,
                    "type": sig.type,
                    "lat": float(pt.y),
                    "lon": float(pt.x),
                    "utm_e": float(e_m),
                    "utm_n": float(n_m),
                    "priorite": 75.0 if sig.danger_immediat else 50.0,
                    "danger_immediat": bool(sig.danger_immediat),
                    "hauteur_eau_cm": h_cm,
                    "weight": 0.65 + min(0.85, h_cm / 150.0) + (0.35 if sig.danger_immediat else 0.0),
                }
            )
        except Exception:
            continue

    return items


def calculer_getis_ord_gi_star(
    db: Session,
    rayon_voisinage_m: float = 900.0,
    zone_id: int | None = None,
) -> dict[str, Any]:
    """Calcule la statistique locale d'autocorrélation spatiale Getis-Ord Gi* sur les hexagones 300 m.

    Le voisinage métrique symétrique (d <= rayon_voisinage_m en EPSG:32630, incluant i=j) est évalué
    sur l'ensemble du District d'Abidjan avant filtrage communal éventuel afin d'éliminer tout effet de bord.
    """
    all_rows = _load_hex_rows(db, zone_id=None)
    n = len(all_rows)
    palette_gi = ["#2166ac", "#67a9cf", "#d1e5f0", "#f8fafc", "#fddbc7", "#ef8a62", "#b2182b"]
    labels_gi = [
        "Point froid 99 % (Z <= -2,58)",
        "Point froid 95 % (-2,58 < Z <= -1,96)",
        "Point froid 90 % (-1,96 < Z <= -1,65)",
        "Non significatif (|Z| < 1,65)",
        "Point chaud 90 % (1,65 <= Z < 1,96)",
        "Point chaud 95 % (1,96 <= Z < 2,58)",
        "Point chaud 99 % (Z >= 2,58)",
    ]

    if n == 0:
        return {
            "type": "FeatureCollection",
            "crs_calcul": f"EPSG:{SRID_UTM30N}",
            "rayon_voisinage_m": rayon_voisinage_m,
            "resume": {
                "nb_hotspots_99": 0,
                "nb_hotspots_95": 0,
                "nb_hotspots_90": 0,
                "nb_coldspots": 0,
                "z_max": 0.0,
            },
            "legende": [{"classe": i + 1, "label": labels_gi[i], "couleur": palette_gi[i]} for i in range(7)],
            "features": [],
        }

    hex_polys = [shape(r["geometry"]) for r in all_rows]
    centroids_lon = np.array([p.centroid.x for p in hex_polys], dtype=np.float64)
    centroids_lat = np.array([p.centroid.y for p in hex_polys], dtype=np.float64)
    utm_e, utm_n = lonlat_to_utm30n(centroids_lon, centroids_lat)

    # 1. Agrégation des sinistres actifs dans chaque hexagone 300 m
    events = _collect_active_sinisters(db)
    x_val = np.zeros(n, dtype=np.float64)
    ev_counts = np.zeros(n, dtype=np.int32)

    if events:
        ev_pts = points(
            [e["lon"] for e in events],
            [e["lat"] for e in events],
        )
        hex_tree = STRtree(hex_polys)
        pt_idx, poly_idx = hex_tree.query(ev_pts, predicate="intersects")
        for p_i, h_i in zip(pt_idx.tolist(), poly_idx.tolist(), strict=False):
            x_val[h_i] += events[p_i]["weight"]
            ev_counts[h_i] += 1

    # 2. Matrice de voisinage euclidienne creuse en EPSG:32630 (d <= rayon_voisinage_m, incluant i = j)
    x_bar = float(np.mean(x_val))
    s_std = float(math.sqrt(max(0.0, float(np.mean(x_val * x_val)) - x_bar * x_bar)))

    z_scores = np.zeros(n, dtype=np.float64)
    p_values = np.ones(n, dtype=np.float64)
    neighbor_counts = np.ones(n, dtype=np.int32)

    if n >= 2 and s_std > 1e-9:
        utm_pts = points(utm_e, utm_n)
        utm_tree = STRtree(utm_pts)
        # Disques de rayon R/2 : deux disques s'intersectent ssi distance(ci, cj) <= R
        half_disks = shapely.buffer(utm_pts, rayon_voisinage_m / 2.0, quad_segs=8)
        src_idx, dst_idx = utm_tree.query(half_disks, predicate="intersects")

        # Vérification exacte de la distance euclidienne <= R
        dx = utm_e[dst_idx] - utm_e[src_idx]
        dy = utm_n[dst_idx] - utm_n[src_idx]
        valid_mask = (dx * dx + dy * dy) <= (rayon_voisinage_m * rayon_voisinage_m + 1e-6)
        src_v = src_idx[valid_mask]
        dst_v = dst_idx[valid_mask]

        w_sum = np.bincount(src_v, minlength=n).astype(np.float64)
        wx_sum = np.bincount(src_v, weights=x_val[dst_v], minlength=n)
        neighbor_counts = w_sum.astype(np.int32)

        # Formule exacte d'Ord & Getis (1995) pour poids binaires w_ij in {0, 1} (S_1i = W_i)
        denom_inner = np.maximum(0.0, (n * w_sum - w_sum * w_sum) / float(n - 1))
        denom = s_std * np.sqrt(denom_inner)
        valid_denom = denom > 1e-12
        z_scores[valid_denom] = (wx_sum[valid_denom] - x_bar * w_sum[valid_denom]) / denom[valid_denom]
        for i in range(n):
            p_values[i] = math.erfc(abs(float(z_scores[i])) / math.sqrt(2.0))

    features = []
    counts_bins = [0] * 7
    for i, r in enumerate(all_rows):
        if zone_id is not None and r["zone_id"] != zone_id:
            continue
        geom = r.pop("geometry")
        z = float(z_scores[i])
        pval = float(p_values[i])

        if z <= -2.576:
            bin_i = 0
        elif z <= -1.960:
            bin_i = 1
        elif z <= -1.645:
            bin_i = 2
        elif z < 1.645:
            bin_i = 3
        elif z < 1.960:
            bin_i = 4
        elif z < 2.576:
            bin_i = 5
        else:
            bin_i = 6

        counts_bins[bin_i] += 1
        r["z_score"] = round(z, 3)
        r["p_value"] = round(pval, 4)
        r["nb_evenements"] = int(ev_counts[i])
        r["intensite_sinistre"] = round(float(x_val[i]), 2)
        r["nb_voisins"] = int(neighbor_counts[i])
        r["classe_gi"] = bin_i + 1
        r["interpretation_gi"] = labels_gi[bin_i]
        r["couleur"] = palette_gi[bin_i]
        features.append({"type": "Feature", "properties": r, "geometry": geom})

    return {
        "type": "FeatureCollection",
        "crs_calcul": f"EPSG:{SRID_UTM30N}",
        "zone_filtree_id": zone_id,
        "rayon_voisinage_m": rayon_voisinage_m,
        "resume": {
            "nb_hotspots_99": counts_bins[6],
            "nb_hotspots_95": counts_bins[5],
            "nb_hotspots_90": counts_bins[4],
            "nb_coldspots": counts_bins[0] + counts_bins[1] + counts_bins[2],
            "nb_non_significatifs": counts_bins[3],
            "z_max": round(float(np.max(z_scores)) if z_scores.size else 0.0, 2),
        },
        "legende": [
            {"classe": i + 1, "label": labels_gi[i], "couleur": palette_gi[i], "count": counts_bins[i]}
            for i in range(7)
        ],
        "features": features,
    }


def detecter_points_chauds(
    db: Session,
    eps_m: float = 450.0,
    min_points: int = 2,
) -> list[dict[str, Any]]:
    """Clustering spatial déterministe `ST_ClusterDBSCAN` + enveloppe organique `ST_ConcaveHull` en EPSG:32630.

    Remplace définitivement l'agrégation gloutonne et les disques fixes de 600 m :
    - Regroupe en projection métrique UTM 30N les observations actives (incidents qualifiés et
      signalements corroborants non rejetés) situées à moins de `eps_m` mètres (`min_points` minimum).
    - Les points isolés (`cid IS NULL`) sont filtrés comme bruit spatial DBSCAN.
    - L'emprise géométrique de chaque foyer est calculée par `ST_ConcaveHull(..., 0.80)` épaulée
      d'une marge de voirie de 65 m en EPSG:32630 afin de restituer le vrai corridor inondé.
    """
    dialect = db.bind.dialect.name if db.bind is not None else "sqlite"

    if dialect == "postgresql":
        sql = text(
            """
            WITH observations AS (
                SELECT
                    'incident'::text AS kind,
                    i.id AS obj_id,
                    i.type AS typ,
                    COALESCE(i.score_priorite, 50.0) AS prio,
                    COALESCE(i.danger_immediat, false) AS dng,
                    ST_Transform(i.geom, 32630) AS geom_utm
                FROM incident i
                WHERE i.geom IS NOT NULL
                UNION ALL
                SELECT
                    'signalement'::text AS kind,
                    s.id AS obj_id,
                    s.type AS typ,
                    CASE WHEN s.danger_immediat THEN 75.0 ELSE 50.0 END AS prio,
                    COALESCE(s.danger_immediat, false) AS dng,
                    ST_Transform(s.geom, 32630) AS geom_utm
                FROM signalement s
                WHERE s.geom IS NOT NULL AND s.statut != 'rejete'
            ),
            clustered AS (
                SELECT
                    *,
                    ST_ClusterDBSCAN(geom_utm, eps := :eps_m, minpoints := :min_pts) OVER () AS cid
                FROM observations
            ),
            agg AS (
                SELECT
                    cid,
                    COUNT(*) FILTER (WHERE kind = 'incident') AS nb_inc,
                    COUNT(*) FILTER (WHERE kind = 'signalement') AS nb_sig,
                    COUNT(*) AS nb_pts,
                    AVG(prio) FILTER (WHERE kind = 'incident') AS prio_inc,
                    AVG(prio) AS prio_all,
                    COUNT(*) FILTER (WHERE kind = 'incident' AND dng) AS dng_inc,
                    COUNT(*) FILTER (WHERE dng) AS dng_all,
                    ARRAY_AGG(DISTINCT typ) AS types_dom,
                    ARRAY_AGG(obj_id ORDER BY obj_id) FILTER (WHERE kind = 'incident') AS inc_ids,
                    ST_Centroid(ST_Collect(geom_utm)) AS centre_utm,
                    ST_Buffer(ST_ConcaveHull(ST_Collect(geom_utm), 0.80, false), 65.0, 'quad_segs=8') AS hull_utm
                FROM clustered
                WHERE cid IS NOT NULL
                GROUP BY cid
            )
            SELECT
                cid,
                nb_inc,
                nb_sig,
                nb_pts,
                COALESCE(prio_inc, prio_all) AS prio_moy,
                CASE WHEN nb_inc > 0 THEN dng_inc ELSE dng_all END AS danger_cnt,
                types_dom,
                COALESCE(inc_ids, ARRAY[]::integer[]) AS inc_ids,
                ST_X(centre_utm) AS utm_e,
                ST_Y(centre_utm) AS utm_n,
                ST_X(ST_Transform(centre_utm, 4326)) AS lon,
                ST_Y(ST_Transform(centre_utm, 4326)) AS lat,
                ST_Area(hull_utm) / 1000000.0 AS area_km2,
                ST_Perimeter(hull_utm) AS perim_m,
                ST_AsGeoJSON(ST_Transform(hull_utm, 4326), 5) AS hull_geojson
            FROM agg
            ORDER BY nb_inc DESC, nb_pts DESC, cid ASC;
            """
        )
        rows = db.execute(sql, {"eps_m": float(eps_m), "min_pts": int(min_points)}).mappings().all()
        resultats: list[dict[str, Any]] = []
        for idx, r in enumerate(rows, start=1):
            nb_inc = int(r["nb_inc"])
            nb_sig = int(r["nb_sig"])
            effectif_principal = nb_inc if nb_inc > 0 else nb_sig
            prio_moy = float(r["prio_moy"] or 50.0)
            danger_cnt = int(r["danger_cnt"] or 0)

            if effectif_principal >= 3 or danger_cnt >= 2 or prio_moy >= 80:
                recurrence = "critique"
                score_hotspot = 95
            elif effectif_principal >= 2 or danger_cnt >= 1 or prio_moy >= 65:
                recurrence = "forte"
                score_hotspot = 78
            elif prio_moy >= 50:
                recurrence = "moderee"
                score_hotspot = 55
            else:
                recurrence = "faible"
                score_hotspot = 35

            resultats.append(
                {
                    "cluster_id": idx,
                    "algorithme": "ST_ClusterDBSCAN + ST_ConcaveHull (EPSG:32630)",
                    "eps_m": eps_m,
                    "min_points": min_points,
                    "centre": {
                        "lat": round(float(r["lat"]), 6),
                        "lon": round(float(r["lon"]), 6),
                        "utm_e": round(float(r["utm_e"]), 1),
                        "utm_n": round(float(r["utm_n"]), 1),
                    },
                    "superficie_cluster_km2": round(float(r["area_km2"]), 4),
                    "perimetre_m": round(float(r["perim_m"]), 0),
                    "nombre_incidents": nb_inc if nb_inc > 0 else nb_sig,
                    "nombre_signalements": nb_sig,
                    "nombre_observations": int(r["nb_pts"]),
                    "score_moyen_priorite": round(prio_moy, 1),
                    "danger_immediat_total": danger_cnt,
                    "niveau_recurrence": recurrence,
                    "score_hotspot": score_hotspot,
                    "types_dominants": sorted(list(r["types_dom"] or [])),
                    "incidents_associes": list(r["inc_ids"] or []),
                    "emprise_geojson": json.loads(r["hull_geojson"]),
                }
            )
        resultats.sort(key=lambda x: (x["score_hotspot"], x["nombre_observations"]), reverse=True)
        return resultats

    # Repli exact hors-PostGIS (tests unitaires SQLite) : DBSCAN euclidien + shapely.concave_hull en EPSG:32630
    obs = _collect_active_sinisters(db)
    if len(obs) < min_points:
        return []

    n_obs = len(obs)
    adj: list[list[int]] = [[] for _ in range(n_obs)]
    for i in range(n_obs):
        for j in range(n_obs):
            if distance_m_utm30n(obs[i]["lon"], obs[i]["lat"], obs[j]["lon"], obs[j]["lat"]) <= eps_m:
                adj[i].append(j)

    labels = [-1] * n_obs
    cluster_idx = 0
    for i in range(n_obs):
        if labels[i] != -1 or len(adj[i]) < min_points:
            continue
        labels[i] = cluster_idx
        queue = list(adj[i])
        q_pos = 0
        while q_pos < len(queue):
            curr = queue[q_pos]
            q_pos += 1
            if labels[curr] == -1:
                labels[curr] = cluster_idx
                if len(adj[curr]) >= min_points:
                    for nb in adj[curr]:
                        if labels[nb] == -1:
                            queue.append(nb)
        cluster_idx += 1

    grouped: dict[int, list[dict[str, Any]]] = {}
    for idx_pt, cid in enumerate(labels):
        if cid >= 0:
            grouped.setdefault(cid, []).append(obs[idx_pt])

    resultats = []
    for idx_out, cl in enumerate(grouped.values(), start=1):
        incs = [p for p in cl if p["kind"] == "incident"]
        sigs = [p for p in cl if p["kind"] == "signalement"]
        nb_inc = len(incs)
        nb_sig = len(sigs)
        ref_list = incs if incs else sigs

        mp_utm = MultiPoint([(p["utm_e"], p["utm_n"]) for p in cl])
        hull_utm = shapely.concave_hull(mp_utm, ratio=0.80).buffer(65.0, quad_segs=8)
        hull_wgs84 = geom_to_wgs84(hull_utm)

        e_moy = float(mp_utm.centroid.x)
        n_moy = float(mp_utm.centroid.y)
        lon_moy, lat_moy = utm30n_to_lonlat(e_moy, n_moy)

        prio_moy = sum(p["priorite"] for p in ref_list) / len(ref_list)
        danger_cnt = sum(1 for p in ref_list if p["danger_immediat"])
        effectif = len(ref_list)

        if effectif >= 3 or danger_cnt >= 2 or prio_moy >= 80:
            recurrence, score_hotspot = "critique", 95
        elif effectif >= 2 or danger_cnt >= 1 or prio_moy >= 65:
            recurrence, score_hotspot = "forte", 78
        elif prio_moy >= 50:
            recurrence, score_hotspot = "moderee", 55
        else:
            recurrence, score_hotspot = "faible", 35

        resultats.append(
            {
                "cluster_id": idx_out,
                "algorithme": "ST_ClusterDBSCAN + ST_ConcaveHull (EPSG:32630)",
                "eps_m": eps_m,
                "min_points": min_points,
                "centre": {
                    "lat": round(lat_moy, 6),
                    "lon": round(lon_moy, 6),
                    "utm_e": round(e_moy, 1),
                    "utm_n": round(n_moy, 1),
                },
                "superficie_cluster_km2": round(float(hull_utm.area) / 1_000_000.0, 4),
                "perimetre_m": round(float(hull_utm.length), 0),
                "nombre_incidents": nb_inc if nb_inc > 0 else nb_sig,
                "nombre_signalements": nb_sig,
                "nombre_observations": len(cl),
                "score_moyen_priorite": round(prio_moy, 1),
                "danger_immediat_total": danger_cnt,
                "niveau_recurrence": recurrence,
                "score_hotspot": score_hotspot,
                "types_dominants": sorted({p["type"] for p in cl}),
                "incidents_associes": [p["id"] for p in incs],
                "emprise_geojson": _round_geojson_coords(mapping(hull_wgs84), 5),
            }
        )

    resultats.sort(key=lambda x: (x["score_hotspot"], x["nombre_observations"]), reverse=True)
    return resultats


def calculer_indices_vulnerabilite(db: Session) -> list[dict[str, Any]]:
    """Calcule l'indice multicritère documenté (Aléa × Exposition × Vulnérabilité) par commune.

    Formulation conforme au référentiel UNDRR / GIEC :
        IV_i = 100 * (A_i^0.40 * E_i^0.35 * V_i^0.25)
    où :
    - A_i (Aléa) combine la susceptibilité hydro-topographique MNT/OSM des mailles habitées (70 %)
      et l'intensité hydrométrique des sinistres observés (30 %).
    - E_i (Exposition) normalise logarithmiquement la densité et le volume de population WorldPop 100 m
      résidant dans les mailles exposées.
    - V_i (Vulnérabilité) mesure la part de population concentrée dans les bas-fonds à aléa fort
      (indice_alea >= 55 ou distance hydro <= 350 m) aggravée par les périls vitaux constatés.
    """
    zones = db.scalars(select(Zone).order_by(Zone.nom)).all()
    if not zones:
        return []

    incidents = db.scalars(select(Incident)).all()
    sigs = db.scalars(select(Signalement).where(Signalement.statut != "rejete")).all()
    mailles = db.scalars(select(MailleAnalyse)).all()

    mailles_by_zone: dict[int, list[MailleAnalyse]] = {}
    for m in mailles:
        if m.zone_id is not None:
            mailles_by_zone.setdefault(m.zone_id, []).append(m)

    # Rattachement spatial des signalements aux communes pour capter les hauteurs d'eau terrain
    zone_polys: dict[int, MultiPolygon] = {}
    for z in zones:
        if z.geom is not None:
            try:
                shp = to_shape(z.geom)
                if isinstance(shp, Polygon):
                    zone_polys[z.id] = MultiPolygon([shp])
                elif isinstance(shp, MultiPolygon):
                    zone_polys[z.id] = shp
            except Exception:
                pass

    sigs_by_zone: dict[int, list[Signalement]] = {z.id: [] for z in zones}
    if sigs and zone_polys:
        z_ids_list = list(zone_polys.keys())
        z_tree = STRtree([zone_polys[zid] for zid in z_ids_list])
        valid_sigs = []
        sig_coords = []
        for s in sigs:
            if s.geom is not None:
                try:
                    p = to_shape(s.geom)
                    valid_sigs.append(s)
                    sig_coords.append((p.x, p.y))
                except Exception:
                    continue
        if sig_coords:
            s_pts = points([c[0] for c in sig_coords], [c[1] for c in sig_coords])
            s_idx, z_idx = z_tree.query(s_pts, predicate="intersects")
            for si, zi in zip(s_idx.tolist(), z_idx.tolist(), strict=False):
                sigs_by_zone[z_ids_list[zi]].append(valid_sigs[si])

    raw_stats: list[dict[str, Any]] = []
    for z in zones:
        z_mailles = mailles_by_zone.get(z.id, [])
        z_incs = [i for i in incidents if i.zone_id == z.id]
        z_sigs = sigs_by_zone.get(z.id, [])

        nb_incidents = len(z_incs)
        danger_count = sum(1 for i in z_incs if i.danger_immediat)

        personnes_touchees = 0
        if z_incs:
            inc_ids = [i.id for i in z_incs]
            personnes_touchees = int(
                db.scalar(
                    select(func.coalesce(func.sum(Evaluation.personnes_affectees), 0)).where(
                        Evaluation.incident_id.in_(inc_ids), Evaluation.statut == "soumise"
                    )
                )
                or 0
            )

        pop_totale = round(float(z.population_totale or 0.0), 0)
        sup_km2 = round(float(z.superficie_km2 or 0.0), 3)
        densite = round(float(z.densite_hab_km2 or (pop_totale / sup_km2 if sup_km2 > 0 else 0.0)), 1)

        if z_mailles:
            pops_m = np.array([max(0.0, float(m.population_worldpop or 0.0)) for m in z_mailles], dtype=np.float64)
            aleas_m = np.array([float(m.indice_alea if m.indice_alea is not None else 40.0) for m in z_mailles], dtype=np.float64)
            alts_m = np.array([float(m.altitude_moy_m if m.altitude_moy_m is not None else 25.0) for m in z_mailles], dtype=np.float64)
            dists_m = np.array([float(m.dist_hydro_m if m.dist_hydro_m is not None else 500.0) for m in z_mailles], dtype=np.float64)

            w_pop = pops_m if pops_m.sum() > 0 else np.ones_like(pops_m)
            alea_phys = float(np.average(aleas_m, weights=w_pop))
            alt_moy = float(np.average(alts_m, weights=w_pop))
            dist_moy = float(np.average(dists_m, weights=w_pop))

            mask_fort = (aleas_m >= 55.0) | (dists_m <= 350.0)
            pop_inondable = float(pops_m[mask_fort].sum())
            part_pop_inondable = pop_inondable / max(float(pops_m.sum()), 1.0)
        else:
            alea_phys = 42.0
            alt_moy = 25.0
            dist_moy = 500.0
            pop_inondable = pop_totale * 0.35
            part_pop_inondable = 0.35

        h_max_cm = max((float(s.hauteur_eau_cm or 0.0) for s in z_sigs), default=0.0)
        pression_crise = min(1.0, 0.20 * nb_incidents + 0.25 * danger_count + (h_max_cm / 200.0))
        a_tilde = min(1.0, max(0.05, 0.70 * (alea_phys / 100.0) + 0.30 * pression_crise))

        v_tilde = min(
            1.0,
            max(
                0.12 if pop_totale > 0 else 0.0,
                0.55 * part_pop_inondable
                + 0.45 * min(1.0, 0.18 * nb_incidents + 0.28 * danger_count + personnes_touchees / 200.0),
            ),
        )

        raw_stats.append(
            {
                "zone": z,
                "sup_km2": sup_km2,
                "pop_totale": pop_totale,
                "densite": densite,
                "nb_incidents": nb_incidents,
                "danger_count": danger_count,
                "personnes_touchees": personnes_touchees,
                "alea_phys": round(alea_phys, 1),
                "alt_moy": round(alt_moy, 1),
                "dist_moy": round(dist_moy, 0),
                "pop_inondable": round(pop_inondable, 0),
                "a_tilde": a_tilde,
                "v_tilde": v_tilde,
            }
        )

    max_log_dens = max((math.log1p(s["densite"]) for s in raw_stats), default=1.0) or 1.0
    max_log_pop_inond = max((math.log1p(s["pop_inondable"]) for s in raw_stats), default=1.0) or 1.0

    lignes_brutes: list[dict[str, Any]] = []
    scores_iv: list[float] = []

    for s in raw_stats:
        z = s["zone"]
        sup_km2 = s["sup_km2"]
        if s["pop_totale"] > 0:
            e_tilde = min(
                1.0,
                max(
                    0.05,
                    0.55 * (math.log1p(s["densite"]) / max_log_dens)
                    + 0.45 * (math.log1p(s["pop_inondable"]) / max_log_pop_inond),
                ),
            )
        else:
            e_tilde = 0.0

        a_tilde = s["a_tilde"]
        v_tilde = s["v_tilde"]
        score_iv = round(100.0 * (a_tilde**0.40) * (e_tilde**0.35) * (v_tilde**0.25), 1)

        geom_geojson = None
        centre = None
        if z.geom is not None:
            try:
                sh_geom = to_shape(z.geom)
                geom_geojson = _round_geojson_coords(mapping(sh_geom), 5)
                c = sh_geom.centroid
                e_m, n_m = lonlat_to_utm30n(c.x, c.y)
                centre = {
                    "lat": round(c.y, 6),
                    "lon": round(c.x, 6),
                    "utm_e": round(e_m, 1),
                    "utm_n": round(n_m, 1),
                }
                if sup_km2 <= 0:
                    sup_km2 = round(area_km2_utm30n(sh_geom), 3)
            except Exception:
                geom_geojson = None

        scores_iv.append(score_iv)
        lignes_brutes.append(
            {
                "zone_id": z.id,
                "zone_nom": z.nom,
                "code_adm": z.code_adm or f"CIV-ABJ-{z.id:03d}",
                "superficie_km2": sup_km2,
                "population_totale": s["pop_totale"],
                "population_zone_inondable": s["pop_inondable"],
                "densite_hab_km2": s["densite"],
                "altitude_moy_m": s["alt_moy"],
                "dist_hydro_moy_m": s["dist_moy"],
                "score_alea": round(a_tilde * 100.0, 1),
                "score_exposition": round(e_tilde * 100.0, 1),
                "score_vulnerabilite_soc": round(v_tilde * 100.0, 1),
                "nombre_incidents": s["nb_incidents"],
                "dangers_immediats": s["danger_count"],
                "personnes_affectees_estimees": s["personnes_touchees"],
                "indice_vulnerabilite": score_iv,
                "caracteristique_relief": (
                    f"Alt. moy. {s['alt_moy']:.0f} m · Hydro {s['dist_moy']:.0f} m · "
                    f"{s['densite']:,.0f} hab./km²"
                ).replace(",", " "),
                "geojson": geom_geojson,
                "centre": centre,
            }
        )

    jenks = classify_fisher_jenks(scores_iv, k=5, palette_name="YlOrRd_5")
    labels_k5 = ["faible", "faible", "modere", "eleve", "critique"]
    labels_detail_k5 = ["Très faible", "Faible", "Modéré", "Élevé", "Critique"]
    colors_k5 = ["#16a34a", "#65a30d", "#d97706", "#ea580c", "#dc2626"]

    for idx, item in enumerate(lignes_brutes):
        if jenks.k >= 2 and idx < len(jenks.classes):
            # Recalage proportionnel de la classe 1..jenks.k sur l'échelle 0..4
            raw_cls = jenks.classes[idx] - 1
            c_idx = round(raw_cls * 4 / max(1, jenks.k - 1))
        else:
            val = item["indice_vulnerabilite"]
            c_idx = 4 if val >= 70 else (3 if val >= 52 else (2 if val >= 35 else (1 if val >= 20 else 0)))
        item["classe_risque"] = labels_k5[c_idx]
        item["classe_jenks_label"] = labels_detail_k5[c_idx]
        item["couleur"] = colors_k5[c_idx]
        item["jenks_gvf"] = jenks.gvf
        item["jenks_breaks"] = jenks.breaks

    lignes_brutes.sort(key=lambda x: x["indice_vulnerabilite"], reverse=True)
    return lignes_brutes


def detecter_zones_silencieuses(db: Session) -> list[dict[str, Any]]:
    """Détecte les zones silencieuses par modèle statistique de Poisson Observé ($O_i$) / Attendu ($E_i$).

    Pour chaque commune $i$, le nombre attendu de remontées $E_i$ est proportionnel au produit
    (Population exposée WorldPop × Aléa hydro-topographique physique) :
        E_i = N_total * (W_i / sum_k W_k),  avec W_i = sum_{m in i} Pop_m * (H_m / 100).
    Un secteur présentant un déficit significatif ($O_i < E_i$ avec résidu de déviance $r_{D,i} <= -1.10$
    ou probabilité cumulée gauche $P(Poisson(E_i) <= O_i) <= 0.25$) est signalé en suspicion
    de coupure électrique/télécom ou d'enclavement.
    """
    zones = db.scalars(select(Zone).order_by(Zone.nom)).all()
    if not zones:
        return []

    incidents = db.scalars(select(Incident)).all()
    all_sigs = db.scalars(select(Signalement).where(Signalement.statut != "rejete")).all()
    mailles = db.scalars(select(MailleAnalyse)).all()

    mailles_by_zone: dict[int, list[MailleAnalyse]] = {}
    for m in mailles:
        if m.zone_id is not None:
            mailles_by_zone.setdefault(m.zone_id, []).append(m)

    # Comptage conservatif des observations O_i par commune tel que sum(O_i) == sum(E_i) == N_crise :
    # chaque signalement citoyen actif compte pour 1 dans sa commune, et tout incident sans signalement
    # rattaché compte également pour 1 dans sa commune.
    obs_by_zone: dict[int, int] = {z.id: 0 for z in zones}
    inc_by_zone_cnt: dict[int, int] = {z.id: 0 for z in zones}
    zone_shapes: dict[int, Any] = {}

    for z in zones:
        if z.geom is not None:
            with contextlib.suppress(Exception):
                zone_shapes[z.id] = to_shape(z.geom)

    inc_zone_resolved: dict[int, int] = {}
    for inc in incidents:
        resolved_zid: int | None = None
        if inc.zone_id in obs_by_zone:
            resolved_zid = inc.zone_id
        elif inc.geom is not None and zone_shapes:
            with contextlib.suppress(Exception):
                pt = to_shape(inc.geom)
                for zid, zpoly in zone_shapes.items():
                    if zpoly.intersects(pt):
                        resolved_zid = zid
                        break
        if resolved_zid is not None:
            inc_zone_resolved[inc.id] = resolved_zid
            inc_by_zone_cnt[resolved_zid] += 1

    inc_with_sigs: set[int] = set()
    for sig in all_sigs:
        sig_zid: int | None = None
        if sig.incident_id is not None and sig.incident_id in inc_zone_resolved:
            sig_zid = inc_zone_resolved[sig.incident_id]
            inc_with_sigs.add(sig.incident_id)
        elif sig.geom is not None and zone_shapes:
            with contextlib.suppress(Exception):
                pt = to_shape(sig.geom)
                for zid, zpoly in zone_shapes.items():
                    if zpoly.intersects(pt):
                        sig_zid = zid
                        break
            if sig.incident_id is not None and sig_zid is not None:
                inc_with_sigs.add(sig.incident_id)
        if sig_zid is not None:
            obs_by_zone[sig_zid] += 1

    for inc_id, zid in inc_zone_resolved.items():
        if inc_id not in inc_with_sigs:
            obs_by_zone[zid] += 1

    n_crise_global = sum(obs_by_zone.values())
    if n_crise_global < 3:
        return []

    weights_expo: dict[int, float] = {}
    alea_moy_zone: dict[int, float] = {}
    for z in zones:
        zm = mailles_by_zone.get(z.id, [])
        pop_z = float(z.population_totale or 0.0)
        if zm:
            pops_m = np.array([max(0.0, float(m.population_worldpop or 0.0)) for m in zm], dtype=np.float64)
            aleas_m = np.array([float(m.indice_alea if m.indice_alea is not None else 45.0) for m in zm], dtype=np.float64)
            w_z = float(np.sum(pops_m * (aleas_m / 100.0)))
            a_z = float(np.average(aleas_m, weights=pops_m if pops_m.sum() > 0 else np.ones_like(pops_m)))
        else:
            a_z = 45.0
            w_z = pop_z * (a_z / 100.0)
        weights_expo[z.id] = max(w_z, 0.0)
        alea_moy_zone[z.id] = round(a_z, 1)

    sum_weights = sum(weights_expo.values())
    if sum_weights <= 0.0:
        return []

    silencieuses: list[dict[str, Any]] = []
    for z in zones:
        obs_i = obs_by_zone[z.id]
        exp_i = n_crise_global * (weights_expo[z.id] / sum_weights)
        if exp_i < 0.65 or obs_i >= exp_i:
            continue

        r_dev = _poisson_deviance_residual(float(obs_i), exp_i)
        p_val = _poisson_cdf_left(obs_i, exp_i)
        ratio_oe = round(obs_i / exp_i, 2)
        ecart_pct = round(((obs_i - exp_i) / exp_i) * 100.0, 1)

        if r_dev > -1.10 and p_val > 0.25:
            continue

        if r_dev <= -1.65 or p_val <= 0.08:
            severite = "haute"
            statut_alerte = "SUSPICION D'ISOLEMENT / RUPTURE RÉSEAU"
            action = (
                "Déployer en priorité une patrouille de reconnaissance sur les bas-fonds et vérifier "
                "l'état des relais télécoms / postes électriques CIE du secteur."
            )
        else:
            severite = "moyenne"
            statut_alerte = "SOUS-SIGNALEMENT STATISTIQUE ANORMAL"
            action = (
                "Contacter les points focaux municipaux et chefs de quartiers inondables pour "
                "confirmer l'absence de sinistrés bloqués."
            )

        geom_geojson = None
        centre = None
        if z.id in zone_shapes:
            sh_geom = zone_shapes[z.id]
            geom_geojson = _round_geojson_coords(mapping(sh_geom), 5)
            c = sh_geom.centroid
            centre = {"lat": round(c.y, 6), "lon": round(c.x, 6)}

        pop_z = round(float(z.population_totale or 0.0), 0)
        pop_exp_alea = round(weights_expo[z.id], 0)
        silencieuses.append(
            {
                "zone_id": z.id,
                "zone_nom": z.nom,
                "population_totale": pop_z,
                "population_exposee_alea": pop_exp_alea,
                "indice_alea_moyen": alea_moy_zone[z.id],
                "incidents_enregistres": inc_by_zone_cnt[z.id],
                "observe": obs_i,
                "attendu": round(exp_i, 2),
                "ratio_obs_att": ratio_oe,
                "ecart_relatif_pct": ecart_pct,
                "residu_poisson": round(r_dev, 2),
                "p_value_poisson": round(p_val, 4),
                "statut_alerte": statut_alerte,
                "niveau_severite": severite,
                "motif": (
                    f"Modèle de Poisson : {obs_i} remontée(s) observée(s) contre {exp_i:.1f} attendues "
                    f"({ecart_pct:+.0f} %, résidu r_D = {r_dev:.2f}, p = {p_val:.3f}) au regard des "
                    f"{pop_z:,.0f} hab. WorldPop et d'un aléa physique moyen de {alea_moy_zone[z.id]}/100."
                ).replace(",", " "),
                "action_requise": action,
                "geojson": geom_geojson,
                "centre": centre,
            }
        )

    silencieuses.sort(key=lambda x: (x["residu_poisson"], x["p_value_poisson"]))
    return silencieuses


def generer_rapport_retex_pdf(db: Session) -> bytes:
    """Génère le rapport institutionnel RETEX post-crise intégrant la méthodologie géostatistique complète."""
    meta = obtenir_metadonnees_sig(db)
    hotspots = detecter_points_chauds(db)
    gi_star = calculer_getis_ord_gi_star(db)
    vulnerabilites = calculer_indices_vulnerabilite(db)
    silencieuses = detecter_zones_silencieuses(db)

    total_incidents = db.scalar(select(func.count(Incident.id))) or 0
    total_evalues = db.scalar(select(func.count(Incident.id)).where(Incident.statut.in_(["evalue", "cloture"]))) or 0
    total_clotures = db.scalar(select(func.count(Incident.id)).where(Incident.statut == "cloture")) or 0

    latest = (
        select(func.max(Evaluation.id).label("evaluation_id"))
        .where(Evaluation.statut == "soumise")
        .group_by(Evaluation.incident_id)
        .subquery()
    )
    impact = db.execute(
        select(
            func.coalesce(func.sum(Evaluation.menages_touches), 0),
            func.coalesce(func.sum(Evaluation.personnes_affectees), 0),
            func.coalesce(func.sum(Evaluation.blesses), 0),
            func.coalesce(func.sum(Evaluation.deplaces), 0),
            func.coalesce(func.sum(Evaluation.deces), 0),
            func.coalesce(func.sum(Evaluation.disparus), 0),
        ).join(latest, Evaluation.id == latest.c.evaluation_id)
    ).one()

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=14 * mm,
        leftMargin=14 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
    )
    styles = getSampleStyleSheet()

    h1_style = ParagraphStyle(
        "RetexH1",
        parent=styles["Heading1"],
        fontSize=12.5,
        leading=16,
        textColor=colors.HexColor("#0B1F3A"),
        spaceAfter=4,
        spaceBefore=8,
    )
    body_style = ParagraphStyle(
        "RetexBody",
        parent=styles["BodyText"],
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor("#1E293B"),
    )

    story = [
        Paragraph("O.I.D — Observatoire Inondations & Dommages (District Autonome d'Abidjan)", styles["Title"]),
        Paragraph(
            "RAPPORT DE RETOUR D'EXPÉRIENCE OPÉRATIONNEL & GÉOSTATISTIQUE (RETEX)",
            ParagraphStyle("Sub", parent=styles["Heading2"], fontSize=11, textColor=colors.HexColor("#0284C7"), alignment=1),
        ),
        Paragraph(
            f"Édité le {datetime.now(UTC).strftime('%d/%m/%Y à %H:%M UTC')} — SCR Calcul : {meta['scr_calcul']}",
            styles["Normal"],
        ),
        Spacer(1, 2.5 * mm),
        HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#0284C7"), spaceAfter=4),
    ]

    # 1. Encadré méthodologique SIG
    story.append(Paragraph("1. Protocole Géomatique & Sources des données", h1_style))
    couv = meta["couverture_administrative"]
    mh = meta["maillage_hexagonal"]
    m2 = meta["methodes_lot2"]
    story.append(
        Paragraph(
            f"• <b>Référentiel métrique :</b> {meta['scr_calcul']} — Emprise : {couv['superficie_totale_km2']} km² ({couv['nb_communes']} communes réelles OSM / OCHA COD-AB).<br/>"
            f"• <b>Exposition démographique :</b> {couv['population_totale_worldpop']:,.0f} hab. ({couv['source_population']}) sur {mh['nb_mailles_actives']} hexagones de {mh['cote_m']} m.<br/>"
            f"• <b>Aléa topographique & hydrologique :</b> {couv['source_mnt']} (alt. {mh['altitude_min_m']} à {mh['altitude_max_m']} m) + {couv['source_hydrographie']}.<br/>"
            f"• <b>Modèles spatiaux :</b> {m2['clustering']} · {m2['autocorrelation']} · {m2['vulnerabilite']}.".replace(",", " "),
            body_style,
        )
    )
    story.append(Spacer(1, 3 * mm))

    # 2. Bilan consolidé + Getis-Ord Gi*
    gi_res = gi_star["resume"]
    story.append(Paragraph("2. Bilan Consolidé des Sinistres & Autocorrélation Getis-Ord Gi*", h1_style))
    bilan_data = [
        ["Indicateur opérationnel", "Valeur", "Géostatistique & Impact humain", "Valeur"],
        ["Total incidents qualifiés", str(total_incidents), "Personnes affectées (évaluées)", str(impact[1])],
        ["Incidents investigués / clôturés", f"{total_evalues} / {total_clotures}", "Ménages sinistrés / Déplacés", f"{impact[0]} / {impact[3]}"],
        ["Corridors DBSCAN détectés", str(len(hotspots)), "Blessés / Décès constatés", f"{impact[2]} / {impact[4]}"],
        ["Mailles chaudes Gi* (99 % / 95 %)", f"{gi_res['nb_hotspots_99']} / {gi_res['nb_hotspots_95']}", "Pic d'autocorrélation Z(Gi*)", f"{gi_res['z_max']:+.2f}"],
    ]
    t_bilan = Table(bilan_data, colWidths=[50 * mm, 32 * mm, 56 * mm, 42 * mm])
    t_bilan.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0B1F3A")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                ("PADDING", (0, 0), (-1, -1), 4),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.extend([t_bilan, Spacer(1, 3.5 * mm)])

    # 3. Tableau multicritère des 13 communes
    gvf_val = vulnerabilites[0]["jenks_gvf"] if vulnerabilites else 1.0
    story.append(
        Paragraph(
            f"3. Indice Multicritère de Risque par Commune (Aléa × Exposition × Vulnérabilité — Jenks GVF={gvf_val:.3f})",
            h1_style,
        )
    )
    vuln_rows = [["Commune", "Pop. WorldPop", "Aléa", "Expo.", "Vuln.", "Indice IV", "Classe Jenks"]]
    for v in vulnerabilites:
        vuln_rows.append(
            [
                v["zone_nom"],
                f"{v['population_totale']:,.0f}".replace(",", " "),
                f"{v['score_alea']:.0f}/100",
                f"{v['score_exposition']:.0f}/100",
                f"{v['score_vulnerabilite_soc']:.0f}/100",
                f"{v['indice_vulnerabilite']:.1f}/100",
                v.get("classe_jenks_label", v["classe_risque"]).upper(),
            ]
        )
    if len(vuln_rows) == 1:
        vuln_rows.append(["-", "-", "-", "-", "-", "-", "-"])

    t_vuln = Table(vuln_rows, colWidths=[30 * mm, 27 * mm, 21 * mm, 21 * mm, 21 * mm, 26 * mm, 34 * mm])
    t_vuln.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0B1F3A")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                ("PADDING", (0, 0), (-1, -1), 3.5),
                ("FONTSIZE", (0, 0), (-1, -1), 7.5),
            ]
        )
    )
    story.extend([t_vuln, Spacer(1, 3.5 * mm)])

    # 4. Zones silencieuses (Modèle de Poisson Observé / Attendu)
    story.append(Paragraph("4. Diagnostic des Zones Silencieuses (Modèle de Poisson Observé vs Attendu)", h1_style))
    if silencieuses:
        zs_rows = [["Commune", "Observé (O_i)", "Attendu (E_i)", "Écart", "Résidu r_D", "p-value", "Diagnostic"]]
        for z in silencieuses[:6]:
            zs_rows.append(
                [
                    z["zone_nom"],
                    str(z["observe"]),
                    f"{z['attendu']:.2f}",
                    f"{z['ecart_relatif_pct']:+.0f} %",
                    f"{z['residu_poisson']:+.2f}",
                    f"{z['p_value_poisson']:.3f}",
                    z["statut_alerte"][:30],
                ]
            )
        t_zs = Table(zs_rows, colWidths=[27 * mm, 22 * mm, 23 * mm, 19 * mm, 21 * mm, 19 * mm, 49 * mm])
        t_zs.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#7F1D1D")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#FECACA")),
                    ("PADDING", (0, 0), (-1, -1), 3.5),
                    ("FONTSIZE", (0, 0), (-1, -1), 7.5),
                ]
            )
        )
        story.append(t_zs)
    else:
        story.append(
            Paragraph(
                "Aucun déficit statistiquement significatif de signalement (Poisson O_i vs E_i) détecté sur les 13 communes.",
                body_style,
            )
        )

    doc.build(story)
    return buffer.getvalue()
