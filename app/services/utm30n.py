"""Projection métrique officielle de référence pour Abidjan : WGS 84 / UTM zone 30N (EPSG:32630).

Fournit :
1. Expressions PostGIS natives `ST_Transform(..., 32630)` pour tous les traitements spatiaux en base.
2. Transformation géodésique exacte Transverse de Mercator sur ellipsoïde WGS84 (Snyder, 1987)
   vectorisée en NumPy, utilisable hors-PostGIS (calculs rapides en mémoire et tests unitaires SQLite).
"""

from __future__ import annotations

import math
from typing import overload

import numpy as np
import shapely
from shapely.geometry.base import BaseGeometry
from sqlalchemy import func

# Paramètres officiels de l'ellipsoïde WGS 84 et de la zone UTM 30N (EPSG:32630)
SRID_WGS84 = 4326
SRID_UTM30N = 32630

WGS84_A = 6378137.0
WGS84_F = 1.0 / 298.257223563
WGS84_E2 = 2.0 * WGS84_F - WGS84_F**2
WGS84_EP2 = WGS84_E2 / (1.0 - WGS84_E2)

UTM_K0 = 0.9996
UTM30N_LON0_DEG = -3.0  # Méridien central de la zone UTM 30 (6°W à 0°E — couvre Abidjan ~4°W)
UTM_FE = 500000.0
UTM_FN_NORTH = 0.0


def postgis_to_utm30n(geom_col):
    """Expression SQLAlchemy / PostGIS projetant une géométrie vers EPSG:32630 (mètres)."""
    return func.ST_Transform(geom_col, SRID_UTM30N)


@overload
def lonlat_to_utm30n(lon: float, lat: float) -> tuple[float, float]: ...


@overload
def lonlat_to_utm30n(lon: np.ndarray, lat: np.ndarray) -> tuple[np.ndarray, np.ndarray]: ...


def lonlat_to_utm30n(lon, lat):
    """Projette des coordonnées WGS84 (degrés) en coordonnées métriques UTM 30N (Easting, Northing)."""
    is_scalar = np.ndim(lon) == 0 and np.ndim(lat) == 0
    lon_arr = np.asarray(lon, dtype=np.float64)
    lat_arr = np.asarray(lat, dtype=np.float64)

    phi = np.deg2rad(lat_arr)
    lam = np.deg2rad(lon_arr)
    lam0 = math.radians(UTM30N_LON0_DEG)

    sin_phi = np.sin(phi)
    cos_phi = np.cos(phi)
    tan_phi = np.tan(phi)

    e2 = WGS84_E2
    e4 = e2 * e2
    e6 = e4 * e2
    ep2 = WGS84_EP2

    n_val = WGS84_A / np.sqrt(1.0 - e2 * sin_phi * sin_phi)
    t_val = tan_phi * tan_phi
    c_val = ep2 * cos_phi * cos_phi
    a_val = cos_phi * (lam - lam0)

    # Arc méridien exact (développement au 6e ordre, précision < 0,5 mm)
    m_val = WGS84_A * (
        (1.0 - e2 / 4.0 - 3.0 * e4 / 64.0 - 5.0 * e6 / 256.0) * phi
        - (3.0 * e2 / 8.0 + 3.0 * e4 / 32.0 + 45.0 * e6 / 1024.0) * np.sin(2.0 * phi)
        + (15.0 * e4 / 256.0 + 45.0 * e6 / 1024.0) * np.sin(4.0 * phi)
        - (35.0 * e6 / 3072.0) * np.sin(6.0 * phi)
    )

    a2 = a_val * a_val
    a3 = a2 * a_val
    a4 = a2 * a2
    a5 = a4 * a_val
    a6 = a4 * a2

    easting = UTM_FE + UTM_K0 * n_val * (
        a_val
        + (1.0 - t_val + c_val) * a3 / 6.0
        + (5.0 - 18.0 * t_val + t_val * t_val + 72.0 * c_val - 58.0 * ep2) * a5 / 120.0
    )

    northing = UTM_FN_NORTH + UTM_K0 * (
        m_val
        + n_val
        * tan_phi
        * (
            a2 / 2.0
            + (5.0 - t_val + 9.0 * c_val + 4.0 * c_val * c_val) * a4 / 24.0
            + (61.0 - 58.0 * t_val + t_val * t_val + 600.0 * c_val - 330.0 * ep2) * a6 / 720.0
        )
    )

    if is_scalar:
        return float(easting), float(northing)
    return easting, northing


@overload
def utm30n_to_lonlat(easting: float, northing: float) -> tuple[float, float]: ...


@overload
def utm30n_to_lonlat(easting: np.ndarray, northing: np.ndarray) -> tuple[np.ndarray, np.ndarray]: ...


def utm30n_to_lonlat(easting, northing):
    """Inverse la projection métrique UTM 30N (EPSG:32630) vers WGS84 (lon, lat en degrés)."""
    is_scalar = np.ndim(easting) == 0 and np.ndim(northing) == 0
    x = np.asarray(easting, dtype=np.float64) - UTM_FE
    y = np.asarray(northing, dtype=np.float64) - UTM_FN_NORTH

    e2 = WGS84_E2
    e4 = e2 * e2
    e6 = e4 * e2
    ep2 = WGS84_EP2

    m_val = y / UTM_K0
    mu = m_val / (WGS84_A * (1.0 - e2 / 4.0 - 3.0 * e4 / 64.0 - 5.0 * e6 / 256.0))

    e1 = (1.0 - math.sqrt(1.0 - e2)) / (1.0 + math.sqrt(1.0 - e2))
    e1_2 = e1 * e1
    e1_3 = e1_2 * e1
    e1_4 = e1_2 * e1_2

    phi1 = (
        mu
        + (3.0 * e1 / 2.0 - 27.0 * e1_3 / 32.0) * np.sin(2.0 * mu)
        + (21.0 * e1_2 / 16.0 - 55.0 * e1_4 / 32.0) * np.sin(4.0 * mu)
        + (151.0 * e1_3 / 96.0) * np.sin(6.0 * mu)
        + (1097.0 * e1_4 / 512.0) * np.sin(8.0 * mu)
    )

    sin_p1 = np.sin(phi1)
    cos_p1 = np.cos(phi1)
    tan_p1 = np.tan(phi1)

    n1 = WGS84_A / np.sqrt(1.0 - e2 * sin_p1 * sin_p1)
    t1 = tan_p1 * tan_p1
    c1 = ep2 * cos_p1 * cos_p1
    r1 = WGS84_A * (1.0 - e2) / np.power(1.0 - e2 * sin_p1 * sin_p1, 1.5)
    d = x / (n1 * UTM_K0)

    d2 = d * d
    d3 = d2 * d
    d4 = d2 * d2
    d5 = d4 * d
    d6 = d4 * d2

    lat_rad = phi1 - (n1 * tan_p1 / r1) * (
        d2 / 2.0
        - (5.0 + 3.0 * t1 + 10.0 * c1 - 4.0 * c1 * c1 - 9.0 * ep2) * d4 / 24.0
        + (61.0 + 90.0 * t1 + 298.0 * c1 + 45.0 * t1 * t1 - 252.0 * ep2 - 3.0 * c1 * c1) * d6 / 720.0
    )

    lon_rad = math.radians(UTM30N_LON0_DEG) + (
        d
        - (1.0 + 2.0 * t1 + c1) * d3 / 6.0
        + (5.0 - 2.0 * c1 + 28.0 * t1 - 3.0 * c1 * c1 + 8.0 * ep2 + 24.0 * t1 * t1) * d5 / 120.0
    ) / cos_p1

    lon_deg = np.rad2deg(lon_rad)
    lat_deg = np.rad2deg(lat_rad)

    if is_scalar:
        return float(lon_deg), float(lat_deg)
    return lon_deg, lat_deg


def geom_to_utm30n(geom: BaseGeometry) -> BaseGeometry:
    """Reprojette une géométrie Shapely d'EPSG:4326 vers EPSG:32630 (vectorisé)."""
    return shapely.transform(geom, lambda coords: np.column_stack(lonlat_to_utm30n(coords[:, 0], coords[:, 1])))


def geom_to_wgs84(geom_utm: BaseGeometry) -> BaseGeometry:
    """Reprojette une géométrie Shapely d'EPSG:32630 vers EPSG:4326 (vectorisé)."""
    return shapely.transform(geom_utm, lambda coords: np.column_stack(utm30n_to_lonlat(coords[:, 0], coords[:, 1])))


def area_km2_utm30n(geom_wgs84: BaseGeometry) -> float:
    """Calcule la superficie métrique exacte en km² dans le référentiel EPSG:32630."""
    if geom_wgs84 is None or geom_wgs84.is_empty:
        return 0.0
    return float(geom_to_utm30n(geom_wgs84).area) / 1_000_000.0


def distance_m_utm30n(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Distance euclidienne plane en mètres dans la projection UTM 30N (EPSG:32630)."""
    e1, n1 = lonlat_to_utm30n(lon1, lat1)
    e2, n2 = lonlat_to_utm30n(lon2, lat2)
    return math.hypot(e2 - e1, n2 - n1)
