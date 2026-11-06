"""Détection des doublons par distance réelle en mètres avec PostGIS."""

from datetime import UTC, datetime, timedelta

from geoalchemy2 import Geography
from geoalchemy2.functions import ST_DWithin
from geoalchemy2.shape import to_shape
from sqlalchemy import cast, func, select
from sqlalchemy.orm import Session

from app.models.incident import Incident


def suggerer_doublons(db: Session, signalement, rayon_m: float = 50.0, delai_h: int = 24):
    if signalement.geom is None:
        return []
    try:
        pt = to_shape(signalement.geom)
        point_geom = func.ST_SetSRID(func.ST_MakePoint(pt.x, pt.y), 4326)
        limite = datetime.now(UTC) - timedelta(hours=delai_h)
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
        # Fallback si spatial non supporté (ex: SQLite pur sans Spatialite)
        return []

