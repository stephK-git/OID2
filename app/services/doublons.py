"""Détection des doublons par distance réelle en mètres avec PostGIS (et repli Haversine)."""

import math
from datetime import UTC, datetime, timedelta

from geoalchemy2 import Geography
from geoalchemy2.functions import ST_DWithin
from geoalchemy2.shape import to_shape
from sqlalchemy import cast, func, select
from sqlalchemy.orm import Session

from app.models.incident import Incident


def haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calcule la distance géodésique Haversine en mètres entre deux points WGS84."""
    r = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    return 2.0 * r * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))


def suggerer_doublons(db: Session, signalement, rayon_m: float = 400.0, delai_h: int = 24):
    if signalement.geom is None:
        return []
    try:
        pt = to_shape(signalement.geom)
    except Exception:
        return []

    limite = datetime.now(UTC) - timedelta(hours=delai_h)
    try:
        point_geom = func.ST_SetSRID(func.ST_MakePoint(pt.x, pt.y), 4326)
        stmt = (
            select(Incident)
            .where(
                Incident.type == signalement.type,
                Incident.cree_le >= limite,
                Incident.statut.in_(["ouvert", "affecte", "evalue", "rouvert"]),
                ST_DWithin(
                    cast(Incident.geom, Geography(srid=4326)),
                    cast(point_geom, Geography(srid=4326)),
                    rayon_m,
                ),
            )
            .order_by(Incident.cree_le.desc())
        )
        return list(db.scalars(stmt).all())
    except Exception:
        # Repli Haversine si le moteur SQL ne supporte pas Geography/ST_DWithin
        try:
            candidats = db.scalars(
                select(Incident)
                .where(
                    Incident.type == signalement.type,
                    Incident.statut.in_(["ouvert", "affecte", "evalue", "rouvert"]),
                )
                .order_by(Incident.cree_le.desc())
            ).all()
            out = []
            for inc in candidats:
                if inc.geom is None:
                    continue
                inc_pt = to_shape(inc.geom)
                dist = haversine_distance_m(pt.y, pt.x, inc_pt.y, inc_pt.x)
                if dist <= rayon_m:
                    out.append(inc)
            return out
        except Exception:
            return []


