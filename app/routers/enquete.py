"""Dossiers affectés et évaluations de terrain."""

from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from geoalchemy2.shape import to_shape
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.db.session import get_db
from app.models.evaluation import Evaluation
from app.models.incident import Incident
from app.models.photo import Photo
from app.models.utilisateur import Utilisateur
from app.services.photos import PhotoError, save_photo_data_url
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
    )



def _incident_attribue(db: Session, incident_id: int, user: Utilisateur):
    inc = db.get(Incident, incident_id)
    if inc is None or inc.enqueteur_id != user.id:
        raise HTTPException(404, "Dossier introuvable ou non affecté à cet enquêteur.")
    return inc


def _incident_to_dict(inc: Incident) -> dict:
    coords = None
    if inc.geom is not None:
        try:
            pt = to_shape(inc.geom)
            coords = {"lat": pt.y, "lon": pt.x}
        except Exception:
            pass
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
        "cree_le": inc.cree_le.isoformat() if inc.cree_le else None,
        "maj_le": inc.maj_le.isoformat() if inc.maj_le else None,
    }


@router.get("/mes-dossiers")
def mes_dossiers(
    db: Session = Depends(get_db),
    user: Utilisateur = Depends(require_role("enqueteur")),
):
    rows = db.scalars(
        select(Incident)
        .where(Incident.enqueteur_id == user.id)
        .order_by(Incident.score_priorite.desc(), Incident.cree_le.asc())
    ).all()
    results = []
    for inc in rows:
        d = _incident_to_dict(inc)
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
    user: Utilisateur = Depends(require_role("enqueteur")),
):
    """Détail complet d'un incident affecté à l'enquêteur connecté."""
    inc = _incident_attribue(db, incident_id, user)
    # Cherche l'évaluation la plus récente
    ev = db.scalar(
        select(Evaluation)
        .where(Evaluation.incident_id == incident_id)
        .order_by(Evaluation.id.desc())
    )
    result = _incident_to_dict(inc)
    result["evaluation_statut"] = ev.statut if ev else "aucune"
    return result


@router.get("/{incident_id}/evaluation")
def lire_evaluation(
    incident_id: int,
    db: Session = Depends(get_db),
    user: Utilisateur = Depends(require_role("enqueteur")),
):
    _incident_attribue(db, incident_id, user)
    ev = db.scalar(
        select(Evaluation)
        .where(Evaluation.incident_id == incident_id)
        .order_by(Evaluation.id.desc())
    )
    if ev is None:
        return {"statut": "aucune", "photos": []}
    photos = [p.url for p in db.scalars(select(Photo).where(Photo.evaluation_id == ev.id)).all()]
    eval_fields = {k: getattr(ev, k) for k in EvalIn.model_fields if k != "photos_data_urls"}
    return {
        "id": ev.id,
        "statut": ev.statut,
        "soumise_le": ev.soumise_le.isoformat() if ev.soumise_le else None,
        "photos": photos,
        **eval_fields,
    }


@router.put("/{incident_id}/evaluation")
def sauver_brouillon(
    incident_id: int,
    data: EvalIn,
    db: Session = Depends(get_db),
    user: Utilisateur = Depends(require_role("enqueteur")),
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
    return {"id": ev.id, "statut": ev.statut, "photos": photos}


@router.post("/{incident_id}/soumettre")
def soumettre(
    incident_id: int,
    data: EvalIn,
    db: Session = Depends(get_db),
    user: Utilisateur = Depends(require_role("enqueteur")),
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
    return {"ok": True, "evaluation_id": ev.id, "statut": ev.statut, "photos": photos}
