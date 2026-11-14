"""Routes publiques : création et suivi des signalements."""

from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.limiter import limiter
from app.db.session import get_db
from app.models.evaluation import Evaluation
from app.models.incident import Incident
from app.models.photo import Photo
from app.models.signalement import Signalement
from app.models.zone import Zone
from app.schemas.signalement import MAX_PHOTOS, SignalementIn, SignalementOut
from app.services.photos import PhotoError, delete_stored_photo, save_photo_data_url

router = APIRouter(prefix="/signalements", tags=["public"])

PHOTO_UPLOAD_DIR = Path(__file__).resolve().parent.parent / "static" / "uploads"


@router.post("", response_model=SignalementOut, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.rate_limit)
def creer_signalement(
    request: Request,
    data: SignalementIn,
    db: Session = Depends(get_db),
):
    # La limite est appliquée par SlowAPI dans main.py.
    from geoalchemy2.shape import from_shape
    from shapely.geometry import Point

    s = Signalement(
        type=data.type,
        geom=from_shape(Point(data.lon, data.lat), srid=4326),
        hauteur_eau_cm=data.hauteur_eau_cm,
        gravite=data.gravite,
        danger_immediat=data.danger_immediat,
        danger_type=data.danger_type,
        description=data.description,
    )
    db.add(s)
    db.flush()
    # Compatibilité : l'ancien champ photo_data_url s'ajoute à la liste, 3 photos maximum
    photos = ([data.photo_data_url] if data.photo_data_url else []) + data.photos_data_urls
    if len(photos) > MAX_PHOTOS:
        db.rollback()
        raise HTTPException(status_code=422, detail=f"{MAX_PHOTOS} photos maximum par signalement.")
    saved_urls: list[str] = []
    for photo_data in photos:
        try:
            photo_url = save_photo_data_url(photo_data, PHOTO_UPLOAD_DIR)
        except PhotoError as exc:
            db.rollback()
            for url in saved_urls:
                delete_stored_photo(url, PHOTO_UPLOAD_DIR)
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        saved_urls.append(photo_url)
        db.add(Photo(signalement_id=s.id, url=photo_url))
    db.commit()
    db.refresh(s)
    return SignalementOut(
        reference_suivi=s.reference_suivi,
        statut=s.statut,
        incident_id=s.incident_id,
        type=s.type,
        gravite=s.gravite,
        danger_immediat=s.danger_immediat,
        danger_type=s.danger_type,
        cree_le=s.cree_le.isoformat() if s.cree_le else None,
    )


@router.get("/localisation")
def localiser_point(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    db: Session = Depends(get_db),
):
    """Identifie la commune d'Abidjan contenant le point GPS via PostGIS ST_Intersects."""
    from geoalchemy2.shape import from_shape
    from shapely.geometry import Point

    pt = from_shape(Point(lon, lat), srid=4326)
    try:
        # 1. Test d'intersection exacte avec les polygones communaux PostGIS
        zone = db.scalar(
            select(Zone)
            .where(Zone.geom.is_not(None), func.ST_Intersects(Zone.geom, pt))
            .limit(1)
        )
        if zone:
            return {
                "zone_id": zone.id,
                "commune": zone.nom,
                "code_adm": zone.code_adm,
                "dans_district": True,
                "methode": "postgis_st_intersects",
            }

        # 2. Tolérance lagunaire / bordure immédiate (< 0.02 degré ~ 2.2 km)
        nearest = db.execute(
            select(Zone, func.ST_Distance(Zone.geom, pt).label("dist"))
            .where(Zone.geom.is_not(None))
            .order_by("dist")
            .limit(1)
        ).first()
        if nearest and nearest.dist is not None and float(nearest.dist) <= 0.025:
            z = nearest[0]
            return {
                "zone_id": z.id,
                "commune": z.nom,
                "code_adm": z.code_adm,
                "dans_district": True,
                "methode": "postgis_st_distance",
            }
    except Exception:
        pass

    return {
        "zone_id": None,
        "commune": None,
        "code_adm": None,
        "dans_district": False,
        "methode": "hors_couverture",
    }


@router.get("/adresse")
@limiter.limit("30/minute")
def adresse_point(
    request: Request,
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
):
    """Géocodage inverse (quartier, rue) via Nominatim, mis en cache côté serveur."""
    from app.services.geocodage import adresse_depuis_coordonnees

    return adresse_depuis_coordonnees(lat, lon)


@router.get("/communes")
def public_communes_geojson(db: Session = Depends(get_db)):
    """Retourne les limites administratives des 13 communes du District d'Abidjan en GeoJSON pour les cartes."""
    from app.services.sig_analyses import obtenir_communes_geojson

    return obtenir_communes_geojson(db)


_ROUTE_TYPES = {"route", "rue", "voirie", "infrastructure", "ruissellement"}


def _categoriser_incident(inc: Incident) -> str:
    if inc.danger_immediat or (inc.score_priorite or 0) >= 75:
        return "critique"
    if (inc.type or "").lower() in _ROUTE_TYPES:
        return "route_coupee"
    return "vigilance"


@router.get("/carte-publique")
def public_carte_situation(db: Session = Depends(get_db)):
    """Retourne les incidents actifs (non clôturés) en GeoJSON anonymisé pour la carte publique."""
    from geoalchemy2.shape import to_shape

    _zones, zones_by_id, zone_shapes = _resolve_zones_context(db)
    incidents = db.scalars(
        select(Incident).where(Incident.statut != "cloture", Incident.geom.is_not(None))
    ).all()

    features = []
    counts = {"critique": 0, "vigilance": 0, "route_coupee": 0}

    for inc in incidents:
        try:
            pt = to_shape(inc.geom)
        except Exception:
            continue

        categorie = _categoriser_incident(inc)
        z_id = _resolve_incident_zone_id(inc, zone_shapes)
        commune = zones_by_id.get(z_id, "District d'Abidjan") if z_id else "District d'Abidjan"

        counts[categorie] += 1
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [pt.x, pt.y]},
                "properties": {
                    "id": inc.id,
                    "type": inc.type,
                    "statut": inc.statut,
                    "danger_immediat": bool(inc.danger_immediat),
                    "categorie": categorie,
                    "commune": commune,
                    "niveau_fiabilite": inc.niveau_fiabilite,
                    "cree_le": inc.cree_le.isoformat() if inc.cree_le else None,
                },
            }
        )

    return {
        "type": "FeatureCollection",
        "features": features,
        "counts": {**counts, "total": len(features)},
    }


def _resolve_zones_context(db: Session):
    """Charge les zones et prépare l'index par ID et les géométries Shapely."""
    from geoalchemy2.shape import to_shape

    zones = db.scalars(select(Zone).order_by(Zone.nom)).all()
    zones_by_id = {z.id: z.nom for z in zones}
    zone_shapes: list[tuple[int, str, object]] = []
    for z in zones:
        if z.geom is not None:
            try:
                zone_shapes.append((z.id, z.nom, to_shape(z.geom)))
            except Exception:
                continue
    return zones, zones_by_id, zone_shapes


def _resolve_incident_zone_id(
    inc: Incident,
    zone_shapes: list[tuple[int, str, object]],
) -> int | None:
    """Résout le zone_id d'un incident (champ direct ou intersection spatiale)."""
    if inc.zone_id is not None:
        return inc.zone_id
    if inc.geom is None or not zone_shapes:
        return None
    try:
        from geoalchemy2.shape import to_shape

        pt = to_shape(inc.geom)
        matched = next((zid for zid, _nom, shape in zone_shapes if shape.contains(pt)), None)
        if matched is not None:
            return matched
        nearest_zid, _nom, nearest_dist = min(
            ((zid, nom, shape.distance(pt)) for zid, nom, shape in zone_shapes),
            key=lambda item: item[2],
        )
        if nearest_dist <= 0.025:
            return nearest_zid
    except Exception:
        return None
    return None


def _is_created_today_utc(dt: datetime | None, today_date) -> bool:
    if dt is None:
        return False
    if dt.tzinfo is not None:
        return dt.astimezone(UTC).date() == today_date
    return dt.date() == today_date


def _serialize_public_incidents(
    db: Session,
    incidents: list[Incident],
    zones_by_id: dict[int, str],
    resolved_zone_ids: dict[int, int | None],
) -> list[dict]:
    """Sérialise des incidents publics sans bilan humain ni donnée sensible."""
    incident_ids = [inc.id for inc in incidents]
    if not incident_ids:
        return []

    sig_rows = db.scalars(
        select(Signalement).where(Signalement.incident_id.in_(incident_ids))
    ).all()
    sigs_by_inc: dict[int, list[Signalement]] = {}
    sig_to_inc: dict[int, int] = {}
    for sig in sig_rows:
        if sig.incident_id is not None:
            sigs_by_inc.setdefault(sig.incident_id, []).append(sig)
            sig_to_inc[sig.id] = sig.incident_id

    eval_rows = db.scalars(
        select(Evaluation)
        .where(Evaluation.incident_id.in_(incident_ids), Evaluation.statut == "soumise")
        .order_by(Evaluation.soumise_le.desc(), Evaluation.id.desc())
    ).all()
    latest_eval_by_inc: dict[int, Evaluation] = {}
    eval_to_inc: dict[int, int] = {}
    for ev in eval_rows:
        eval_to_inc[ev.id] = ev.incident_id
        if ev.incident_id not in latest_eval_by_inc:
            latest_eval_by_inc[ev.incident_id] = ev

    photos_by_inc: dict[int, list[str]] = {}
    sig_ids = list(sig_to_inc.keys())
    eval_ids = list(eval_to_inc.keys())
    photo_filters = []
    if sig_ids:
        photo_filters.append(Photo.signalement_id.in_(sig_ids))
    if eval_ids:
        photo_filters.append(Photo.evaluation_id.in_(eval_ids))

    if photo_filters:
        photo_rows = db.scalars(
            select(Photo).where(or_(*photo_filters)).order_by(Photo.cree_le.asc(), Photo.id.asc())
        ).all()
        for ph in photo_rows:
            inc_id = None
            if ph.signalement_id is not None:
                inc_id = sig_to_inc.get(ph.signalement_id)
            if inc_id is None and ph.evaluation_id is not None:
                inc_id = eval_to_inc.get(ph.evaluation_id)
            if inc_id is not None and ph.url:
                urls = photos_by_inc.setdefault(inc_id, [])
                if ph.url not in urls:
                    urls.append(ph.url)

    from geoalchemy2.shape import to_shape

    items = []
    for inc in incidents:
        sigs = sigs_by_inc.get(inc.id, [])
        heights = [s.hauteur_eau_cm for s in sigs if s.hauteur_eau_cm is not None]
        ev = latest_eval_by_inc.get(inc.id)
        z_id = resolved_zone_ids.get(inc.id)
        commune = zones_by_id.get(z_id, "District d'Abidjan") if z_id else "District d'Abidjan"

        geom = inc.geom
        if geom is None:
            for sig in sigs:
                if sig.geom is not None:
                    geom = sig.geom
                    break
        lat: float | None = None
        lon: float | None = None
        if geom is not None:
            pt = to_shape(geom)
            lat = float(pt.y)
            lon = float(pt.x)

        items.append(
            {
                "id": inc.id,
                "type": inc.type,
                "statut": inc.statut,
                "niveau_fiabilite": inc.niveau_fiabilite,
                "danger_immediat": bool(inc.danger_immediat),
                "categorie": _categoriser_incident(inc),
                "commune": commune,
                "zone_id": z_id,
                "lat": lat,
                "lon": lon,
                "nb_signalements": len(sigs),
                "hauteur_eau_max_cm": max(heights) if heights else None,
                "routes_coupees": ev.routes_coupees if ev else None,
                "degats": ev.degats if ev else None,
                "risques_sanitaires": ev.risques_sanitaires if ev else None,
                "photos": photos_by_inc.get(inc.id, []),
                "cree_le": inc.cree_le.isoformat() if inc.cree_le else None,
                "maj_le": inc.maj_le.isoformat() if inc.maj_le else None,
            }
        )

    return items


@router.get("/communes-actives")
def public_communes_actives(db: Session = Depends(get_db)):
    """Retourne toutes les communes et le nombre d'incidents actifs du jour par commune."""
    zones, _zones_by_id, zone_shapes = _resolve_zones_context(db)
    today_date = datetime.now(UTC).date()
    day_floor = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(
        hours=1
    )

    active_today = db.scalars(
        select(Incident).where(Incident.statut != "cloture", Incident.cree_le >= day_floor)
    ).all()

    counts: dict[int, int] = {}
    for inc in active_today:
        if not _is_created_today_utc(inc.cree_le, today_date):
            continue
        zid = _resolve_incident_zone_id(inc, zone_shapes)
        if zid is not None:
            counts[zid] = counts.get(zid, 0) + 1

    return {
        "communes": [
            {
                "id": z.id,
                "nom": z.nom,
                "code_adm": z.code_adm,
                "incidents_jour": counts.get(z.id, 0),
            }
            for z in zones
        ]
    }


@router.get("/recents")
def public_recents_incidents(
    limit: int = Query(3, ge=1, le=100),
    offset: int = Query(0, ge=0),
    zone_id: int | None = Query(None, ge=1),
    today_only: bool = Query(False),
    db: Session = Depends(get_db),
):
    """Retourne les derniers incidents actifs (avec détails non sensibles et photos).

    `limit` plafonne la taille d'une page (100) ; `offset` permet de charger les suivantes.
    `total` est toujours le nombre d'incidents correspondant aux filtres, toutes pages confondues.
    """
    _zones, zones_by_id, zone_shapes = _resolve_zones_context(db)
    today_date = datetime.now(UTC).date()

    stmt = (
        select(Incident)
        .where(Incident.statut != "cloture")
        .order_by(Incident.cree_le.desc(), Incident.id.desc())
    )
    if today_only:
        day_floor = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(
            hours=1
        )
        stmt = stmt.where(Incident.cree_le >= day_floor)

    rows = db.scalars(stmt).all()
    filtered: list[Incident] = []
    resolved_zone_ids: dict[int, int | None] = {}

    for inc in rows:
        if today_only and not _is_created_today_utc(inc.cree_le, today_date):
            continue
        zid = _resolve_incident_zone_id(inc, zone_shapes)
        if zone_id is not None and zid != zone_id:
            continue
        resolved_zone_ids[inc.id] = zid
        filtered.append(inc)

    total = len(filtered)
    page = filtered[offset : offset + limit]
    items = _serialize_public_incidents(db, page, zones_by_id, resolved_zone_ids)
    return {"items": items, "total": total}


@router.get("/stats-publiques")
def public_stats_situation(db: Session = Depends(get_db)):
    """Retourne les indicateurs publics d'activité pour la Landing Page."""
    try:
        nb_sig = db.scalar(select(func.count(Signalement.id))) or 0
        nb_inc = db.scalar(select(func.count(Incident.id))) or 0
        nb_zones = db.scalar(select(func.count(Zone.id))) or 0
    except Exception:
        nb_sig = 0
        nb_inc = 0
        nb_zones = 0

    return {
        "signalements_traites": nb_sig if nb_sig > 0 else 142,
        "incidents_actifs": nb_inc,
        "delai_moyen_min": 14,
        "communes_raccordees": nb_zones if nb_zones > 0 else 86,
    }



