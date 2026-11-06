"""Routes publiques : création et suivi des signalements."""

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.limiter import limiter
from app.db.session import get_db
from app.models.incident import Incident
from app.models.photo import Photo
from app.models.signalement import Signalement
from app.schemas.signalement import SignalementIn, SignalementOut
from app.services.photos import PhotoError, save_photo_data_url

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
    if data.photo_data_url:
        try:
            photo_url = save_photo_data_url(data.photo_data_url, PHOTO_UPLOAD_DIR)
        except PhotoError as exc:
            db.rollback()
            raise HTTPException(status_code=422, detail=str(exc)) from exc
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


@router.get("/{reference}", response_model=SignalementOut)
def suivre_signalement(reference: str, db: Session = Depends(get_db)):
    s = db.scalar(select(Signalement).where(Signalement.reference_suivi == reference))
    if s is None:
        raise HTTPException(status_code=404, detail="Signalement introuvable")
    incident_statut = None
    incident_ref = None
    fiabilite = None
    if s.incident_id:
        inc = db.get(Incident, s.incident_id)
        if inc:
            incident_statut = inc.statut
            incident_ref = inc.reference_publique
            fiabilite = inc.niveau_fiabilite
    return SignalementOut(
        reference_suivi=s.reference_suivi,
        statut=s.statut,
        incident_id=s.incident_id,
        type=s.type,
        gravite=s.gravite,
        danger_immediat=s.danger_immediat,
        danger_type=s.danger_type,
        cree_le=s.cree_le.isoformat() if s.cree_le else None,
        incident_statut=incident_statut,
        incident_reference=incident_ref,
        niveau_fiabilite=fiabilite,
        motif_rejet=s.motif_rejet,
    )


@router.post("/{reference}/aggraver")
def aggraver_signalement(reference: str, db: Session = Depends(get_db)):
    """Marque une aggravation signalée par le citoyen (l'eau monte, danger immédiat)."""
    s = db.scalar(select(Signalement).where(Signalement.reference_suivi == reference))
    if s is None:
        raise HTTPException(status_code=404, detail="Signalement introuvable")
    s.danger_immediat = True
    if s.gravite != "critique":
        s.gravite = "critique"
    if s.incident_id:
        inc = db.get(Incident, s.incident_id)
        if inc:
            inc.danger_immediat = True
            inc.score_priorite = min(100, inc.score_priorite + 15)
    db.commit()
    return {"ok": True, "reference": s.reference_suivi, "danger_immediat": True}
