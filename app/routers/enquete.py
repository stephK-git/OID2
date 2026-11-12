"""Dossiers affectés et évaluations de terrain."""

import contextlib
import math
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from geoalchemy2.shape import to_shape
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.db.session import get_db
from app.models.evaluation import Evaluation
from app.models.incident import Incident
from app.models.photo import Photo
from app.models.signalement import Signalement
from app.models.utilisateur import Utilisateur
from app.models.zone import Zone
from app.routers.verification import _resolve_commune
from app.services.photos import PhotoError, delete_stored_photo, inspect_photo_metadata, save_photo_data_url
from app.services.statuts import transition_incident

router = APIRouter(prefix="/enquete", tags=["enquete"])

PHOTO_UPLOAD_DIR = Path(__file__).resolve().parent.parent / "static" / "uploads"


class EvalIn(BaseModel):
    menages_touches: int = Field(default=0, ge=0)
    personnes_affectees: int = Field(default=0, ge=0)
    blesses: int = Field(default=0, ge=0)
    deplaces: int = Field(default=0, ge=0)
    deces: int = Field(default=0, ge=0)
    disparus: int = Field(default=0, ge=0)
    degats: str | None = Field(default=None, max_length=5000)
    routes_coupees: str | None = Field(default=None, max_length=3000)
    risques_sanitaires: str | None = Field(default=None, max_length=3000)
    besoins: str | None = Field(default=None, max_length=3000)
    recommandations: str | None = Field(default=None, max_length=3000)
    photos_data_urls: list[str] = Field(default_factory=list)


def _coherent(d: EvalIn) -> bool:
    return (
        d.blesses <= d.personnes_affectees
        and d.deces <= d.personnes_affectees
        and d.disparus <= d.personnes_affectees
        and (d.blesses + d.deces + d.disparus) <= d.personnes_affectees
    )


def _wgs84_to_utm30n_fallback(lat: float, lon: float) -> tuple[int, int]:
    """Projection géodésique WGS84 -> UTM Zone 30N (EPSG:32630) de repli."""
    a = 6378137.0
    f = 1 / 298.257223563
    k0 = 0.9996
    e2 = f * (2 - f)
    ep2 = e2 / (1 - e2)
    lat_r = math.radians(lat)
    lon_r = math.radians(lon)
    lon0_r = math.radians(-3.0)  # Méridien central UTM 30N = 3°W
    dlon = lon_r - lon0_r

    sin_lat = math.sin(lat_r)
    cos_lat = math.cos(lat_r)
    tan_lat = math.tan(lat_r)

    n_val = a / math.sqrt(1 - e2 * sin_lat * sin_lat)
    t_val = tan_lat * tan_lat
    c_val = ep2 * cos_lat * cos_lat
    a_val = cos_lat * dlon

    m_val = a * (
        (1 - e2 / 4 - 3 * e2 * e2 / 64) * lat_r
        - (3 * e2 / 8 + 3 * e2 * e2 / 32) * math.sin(2 * lat_r)
        + (15 * e2 * e2 / 256) * math.sin(4 * lat_r)
    )

    easting = 500000.0 + k0 * n_val * (
        a_val
        + (1 - t_val + c_val) * (a_val**3) / 6
        + (5 - 18 * t_val + t_val * t_val + 72 * c_val - 58 * ep2) * (a_val**5) / 120
    )
    northing = k0 * (
        m_val
        + n_val
        * tan_lat
        * (
            a_val * a_val / 2
            + (5 - t_val + 9 * c_val + 4 * c_val * c_val) * (a_val**4) / 24
        )
    )
    return round(easting), round(northing)


def _incident_attribue(db: Session, incident_id: int, user: Utilisateur):
    inc = db.get(Incident, incident_id)
    if inc is None:
        raise HTTPException(404, "Dossier introuvable ou non affecté à cet enquêteur.")
    if user.role != "coordinateur" and inc.enqueteur_id != user.id:
        raise HTTPException(404, "Dossier introuvable ou non affecté à cet enquêteur.")
    return inc


def _incident_to_dict(inc: Incident, db: Session | None = None) -> dict:
    coords = None
    if inc.geom is not None:
        try:
            pt = to_shape(inc.geom)
            utm_e, utm_n = _wgs84_to_utm30n_fallback(pt.y, pt.x)
            if db is not None:
                with contextlib.suppress(Exception):
                    row = db.execute(
                        select(
                            func.ST_X(func.ST_Transform(inc.geom, 32630)).label("e"),
                            func.ST_Y(func.ST_Transform(inc.geom, 32630)).label("n"),
                        )
                    ).first()
                    if row and row.e is not None and row.n is not None:
                        utm_e = round(float(row.e))
                        utm_n = round(float(row.n))
            coords = {"lat": pt.y, "lon": pt.x, "utm_e": utm_e, "utm_n": utm_n}
        except Exception:
            pass

    commune = None
    code_adm = None
    description_citoyenne = None
    hauteur_eau_cm = None
    photos_citoyennes = []
    photos_citoyennes_meta = []

    if db is not None:
        if inc.zone_id:
            with contextlib.suppress(Exception):
                z = db.get(Zone, inc.zone_id)
                if z:
                    commune = z.nom
                    code_adm = z.code_adm
        if not commune and inc.geom is not None:
            commune, code_adm = _resolve_commune(db, inc.geom)

        with contextlib.suppress(Exception):
            sigs = db.scalars(
                select(Signalement)
                .where(Signalement.incident_id == inc.id)
                .order_by(Signalement.cree_le.desc())
            ).all()
            for s in sigs:
                if not description_citoyenne and s.description:
                    description_citoyenne = s.description
                if s.hauteur_eau_cm is not None and (
                    hauteur_eau_cm is None or float(s.hauteur_eau_cm) > hauteur_eau_cm
                ):
                    hauteur_eau_cm = float(s.hauteur_eau_cm)
                for p in db.scalars(select(Photo).where(Photo.signalement_id == s.id)).all():
                    photos_citoyennes.append(p.url)
                    photos_citoyennes_meta.append(inspect_photo_metadata(p.url, PHOTO_UPLOAD_DIR))

    return {
        "id": inc.id,
        "reference_publique": inc.reference_publique,
        "type": inc.type,
        "statut": inc.statut,
        "score_priorite": inc.score_priorite,
        "niveau_fiabilite": inc.niveau_fiabilite,
        "danger_immediat": inc.danger_immediat,
        "enqueteur_id": inc.enqueteur_id,
        "coords": coords,
        "commune": commune,
        "code_adm": code_adm,
        "description_citoyenne": description_citoyenne,
        "hauteur_eau_cm": hauteur_eau_cm,
        "photos_citoyennes": photos_citoyennes,
        "photos_citoyennes_meta": photos_citoyennes_meta,
        "cree_le": inc.cree_le.isoformat() if inc.cree_le else None,
        "maj_le": inc.maj_le.isoformat() if inc.maj_le else None,
    }


@router.get("/mes-dossiers")
def mes_dossiers(
    db: Session = Depends(get_db),
    user: Utilisateur = Depends(require_role("enqueteur", "coordinateur")),
):
    stmt = select(Incident).order_by(Incident.score_priorite.desc(), Incident.cree_le.asc())
    if user.role != "coordinateur":
        stmt = stmt.where(Incident.enqueteur_id == user.id)
    rows = db.scalars(stmt).all()
    results = []
    for inc in rows:
        d = _incident_to_dict(inc, db)
        ev = db.scalar(
            select(Evaluation)
            .where(Evaluation.incident_id == inc.id)
            .order_by(Evaluation.id.desc())
        )
        d["evaluation_statut"] = ev.statut if ev else "aucune"
        results.append(d)
    return results


@router.get("/{incident_id}")
def detail_incident(
    incident_id: int,
    db: Session = Depends(get_db),
    user: Utilisateur = Depends(require_role("enqueteur", "coordinateur")),
):
    """Détail complet d'un incident affecté à l'enquêteur connecté."""
    inc = _incident_attribue(db, incident_id, user)
    ev = db.scalar(
        select(Evaluation)
        .where(Evaluation.incident_id == incident_id)
        .order_by(Evaluation.id.desc())
    )
    result = _incident_to_dict(inc, db)
    result["evaluation_statut"] = ev.statut if ev else "aucune"
    return result


@router.get("/{incident_id}/evaluation")
def lire_evaluation(
    incident_id: int,
    db: Session = Depends(get_db),
    user: Utilisateur = Depends(require_role("enqueteur", "coordinateur")),
):
    _incident_attribue(db, incident_id, user)
    ev = db.scalar(
        select(Evaluation)
        .where(Evaluation.incident_id == incident_id)
        .order_by(Evaluation.id.desc())
    )
    if ev is None:
        return {"statut": "aucune", "photos": [], "photos_meta": []}
    photos = [p.url for p in db.scalars(select(Photo).where(Photo.evaluation_id == ev.id)).all()]
    photos_meta = [inspect_photo_metadata(url, PHOTO_UPLOAD_DIR) for url in photos]
    eval_fields = {k: getattr(ev, k) for k in EvalIn.model_fields if k != "photos_data_urls"}
    return {
        "id": ev.id,
        "statut": ev.statut,
        "soumise_le": ev.soumise_le.isoformat() if ev.soumise_le else None,
        "photos": photos,
        "photos_meta": photos_meta,
        **eval_fields,
    }


@router.put("/{incident_id}/evaluation")
def sauver_brouillon(
    incident_id: int,
    data: EvalIn,
    db: Session = Depends(get_db),
    user: Utilisateur = Depends(require_role("enqueteur", "coordinateur")),
):
    if not _coherent(data):
        raise HTTPException(422, "Évaluation incohérente : les blessés, décès et disparus ne peuvent dépasser les personnes affectées.")
    inc = _incident_attribue(db, incident_id, user)
    if inc.statut != "affecte":
        raise HTTPException(409, "Ce dossier n'est pas dans l'état affecté.")
    ev = db.scalar(
        select(Evaluation)
        .where(Evaluation.incident_id == incident_id, Evaluation.statut == "brouillon")
        .order_by(Evaluation.id.desc())
    )
    if ev is None:
        ev = Evaluation(incident_id=incident_id, enqueteur_id=user.id)
        db.add(ev)
        db.flush()
    eval_dict = data.model_dump(exclude={"photos_data_urls"})
    for key, value in eval_dict.items():
        setattr(ev, key, value)

    # Sauvegarde des nouvelles photos si fournies
    for p_data in data.photos_data_urls:
        if p_data and p_data.startswith("data:image"):
            try:
                p_url = save_photo_data_url(p_data, PHOTO_UPLOAD_DIR)
                db.add(Photo(evaluation_id=ev.id, url=p_url))
            except PhotoError as exc:
                db.rollback()
                raise HTTPException(422, str(exc)) from exc

    db.commit()
    db.refresh(ev)
    photos = [p.url for p in db.scalars(select(Photo).where(Photo.evaluation_id == ev.id)).all()]
    photos_meta = [inspect_photo_metadata(url, PHOTO_UPLOAD_DIR) for url in photos]
    return {"id": ev.id, "statut": ev.statut, "photos": photos, "photos_meta": photos_meta}


@router.delete("/{incident_id}/photos")
def supprimer_photo_brouillon(
    incident_id: int,
    url: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    user: Utilisateur = Depends(require_role("enqueteur", "coordinateur")),
):
    """Supprime une photo rattachée au brouillon d'évaluation avant soumission."""
    inc = _incident_attribue(db, incident_id, user)
    if inc.statut != "affecte":
        raise HTTPException(409, "Les photos ne peuvent être supprimées que sur un dossier affecté.")
    ev = db.scalar(
        select(Evaluation)
        .where(Evaluation.incident_id == incident_id, Evaluation.statut == "brouillon")
        .order_by(Evaluation.id.desc())
    )
    if ev is None:
        raise HTTPException(404, "Aucun brouillon actif pour cet incident.")
    photo = db.scalar(select(Photo).where(Photo.evaluation_id == ev.id, Photo.url == url))
    if photo is None:
        raise HTTPException(404, "Photo introuvable dans ce brouillon.")
    photo_url = photo.url
    db.delete(photo)
    db.commit()
    delete_stored_photo(photo_url, PHOTO_UPLOAD_DIR)
    photos = [p.url for p in db.scalars(select(Photo).where(Photo.evaluation_id == ev.id)).all()]
    photos_meta = [inspect_photo_metadata(u, PHOTO_UPLOAD_DIR) for u in photos]
    return {"ok": True, "photos": photos, "photos_meta": photos_meta}


@router.post("/{incident_id}/soumettre")
def soumettre(
    incident_id: int,
    data: EvalIn,
    db: Session = Depends(get_db),
    user: Utilisateur = Depends(require_role("enqueteur", "coordinateur")),
):
    if not _coherent(data):
        raise HTTPException(422, "Évaluation incohérente : les blessés, décès et disparus ne peuvent dépasser les personnes affectées.")
    inc = _incident_attribue(db, incident_id, user)
    if inc.statut != "affecte":
        raise HTTPException(409, "Ce dossier n'est pas dans l'état affecté.")
    ev = db.scalar(
        select(Evaluation)
        .where(Evaluation.incident_id == incident_id, Evaluation.statut == "brouillon")
        .order_by(Evaluation.id.desc())
    )
    if ev is None:
        ev = Evaluation(incident_id=incident_id, enqueteur_id=user.id)
        db.add(ev)
        db.flush()
    eval_dict = data.model_dump(exclude={"photos_data_urls"})
    for key, value in eval_dict.items():
        setattr(ev, key, value)

    # Sauvegarde des nouvelles photos si fournies
    for p_data in data.photos_data_urls:
        if p_data and p_data.startswith("data:image"):
            try:
                p_url = save_photo_data_url(p_data, PHOTO_UPLOAD_DIR)
                db.add(Photo(evaluation_id=ev.id, url=p_url))
            except PhotoError as exc:
                db.rollback()
                raise HTTPException(422, str(exc)) from exc

    ev.statut = "soumise"
    ev.soumise_le = datetime.now(UTC)
    inc.niveau_fiabilite = "verifie"
    transition_incident(db, inc, "evalue", user.id)
    db.commit()
    photos = [p.url for p in db.scalars(select(Photo).where(Photo.evaluation_id == ev.id)).all()]
    photos_meta = [inspect_photo_metadata(url, PHOTO_UPLOAD_DIR) for url in photos]
    return {"ok": True, "evaluation_id": ev.id, "statut": ev.statut, "photos": photos, "photos_meta": photos_meta}
