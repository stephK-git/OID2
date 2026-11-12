"""File de vérification, validation, rejet et fusion manuelle des doublons."""

import contextlib
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from geoalchemy2.shape import to_shape
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.db.session import get_db
from app.models.incident import Incident
from app.models.photo import Photo
from app.models.signalement import Signalement
from app.models.utilisateur import Utilisateur
from app.models.zone import Zone
from app.services.doublons import haversine_distance_m, suggerer_doublons
from app.services.photos import inspect_photo_metadata
from app.services.priorite import score_priorite
from app.services.statuts import transition_signalement

router = APIRouter(prefix="/verification", tags=["verification"])

PHOTO_UPLOAD_DIR = Path(__file__).resolve().parent.parent / "static" / "uploads"


def _not_found():
    raise HTTPException(status_code=404, detail="Signalement introuvable")


def _resolve_commune(db: Session | None, geom) -> tuple[str | None, str | None]:
    """Résout le nom et le code administratif de la commune PostGIS contenant le point."""
    if db is None or geom is None:
        return None, None
    with contextlib.suppress(Exception):
        zone = db.scalar(
            select(Zone)
            .where(Zone.geom.is_not(None), func.ST_Intersects(Zone.geom, geom))
            .limit(1)
        )
        if zone:
            return zone.nom, zone.code_adm

        nearest = db.execute(
            select(Zone, func.ST_Distance(Zone.geom, geom).label("dist"))
            .where(Zone.geom.is_not(None))
            .order_by("dist")
            .limit(1)
        ).first()
        if nearest and nearest.dist is not None and float(nearest.dist) <= 0.025:
            z = nearest[0]
            return z.nom, z.code_adm
    return None, None


def _serialize_doublon(db: Session | None, sig_coords: dict | None, inc: Incident) -> dict:
    """Enrichit un incident doublon suggéré avec distance exacte (m), coordonnées et signalements liés."""
    inc_coords = None
    distance_m = None
    if inc.geom is not None:
        with contextlib.suppress(Exception):
            pt = to_shape(inc.geom)
            inc_coords = {"lat": pt.y, "lon": pt.x}
            if sig_coords:
                distance_m = round(
                    haversine_distance_m(sig_coords["lat"], sig_coords["lon"], pt.y, pt.x)
                )

    nb_lies = 1
    if db is not None:
        with contextlib.suppress(Exception):
            cnt = db.scalar(
                select(func.count(Signalement.id)).where(Signalement.incident_id == inc.id)
            )
            if cnt is not None and int(cnt) > 0:
                nb_lies = int(cnt)

    return {
        "id": inc.id,
        "reference_publique": inc.reference_publique,
        "statut": inc.statut,
        "type": inc.type,
        "score_priorite": inc.score_priorite,
        "distance_m": distance_m,
        "nb_signalements_lies": nb_lies,
        "coords": inc_coords,
    }


def _signalement_to_dict(s: Signalement, suggestions: list, db: Session | None = None) -> dict:
    """Sérialise un signalement pour la réponse API."""
    coords = None
    if s.geom is not None:
        try:
            pt = to_shape(s.geom)
            coords = {"lat": pt.y, "lon": pt.x}
        except Exception:
            pass

    commune, code_adm = _resolve_commune(db, s.geom)

    maintenant = datetime.now(UTC)
    en_retard = False
    if s.cree_le and s.statut == "recu":
        dt = s.cree_le
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        age_sec = (maintenant - dt).total_seconds()
        seuil = 900 if s.danger_immediat else 7200
        en_retard = age_sec > seuil

    photos = []
    photos_meta = []
    if db is not None:
        photos = [p.url for p in db.scalars(select(Photo).where(Photo.signalement_id == s.id)).all()]
        photos_meta = [inspect_photo_metadata(url, PHOTO_UPLOAD_DIR) for url in photos]

    doublons_enrichis = [_serialize_doublon(db, coords, i) for i in suggestions]
    doublons_enrichis.sort(key=lambda d: d["distance_m"] if d["distance_m"] is not None else 999999)

    return {
        "id": s.id,
        "reference_suivi": s.reference_suivi,
        "type": s.type,
        "statut": s.statut,
        "gravite": s.gravite,
        "hauteur_eau_cm": s.hauteur_eau_cm,
        "danger_immediat": s.danger_immediat,
        "danger_type": s.danger_type,
        "description": s.description,
        "coords": coords,
        "commune": commune,
        "code_adm": code_adm,
        "photos": photos,
        "photos_meta": photos_meta,
        "cree_le": s.cree_le.isoformat() if s.cree_le else None,
        "score_priorite": score_priorite(
            s.danger_immediat, s.gravite, s.hauteur_eau_cm, danger_type=s.danger_type
        ),
        "en_retard": en_retard,
        "doublons_suggeres": doublons_enrichis,
    }


@router.get("/file")
def file_attente(
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(require_role("verificateur", "coordinateur")),
):
    rows = db.scalars(
        select(Signalement)
        .where(Signalement.statut == "recu")
        .order_by(Signalement.danger_immediat.desc(), Signalement.cree_le.asc())
    ).all()
    result = [_signalement_to_dict(s, suggerer_doublons(db, s), db) for s in rows]
    result.sort(key=lambda x: x["score_priorite"], reverse=True)
    return result


@router.get("/historique")
def historique_traites(
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(require_role("verificateur", "coordinateur")),
):
    """Retourne les 50 derniers signalements traités (validés, rejetés ou doublons)."""
    rows = db.scalars(
        select(Signalement)
        .where(Signalement.statut.in_(["valide", "rejete", "doublon"]))
        .order_by(Signalement.verifie_le.desc().nullslast(), Signalement.cree_le.desc())
        .limit(50)
    ).all()
    out = []
    for s in rows:
        verif = db.get(Utilisateur, s.verifie_par) if s.verifie_par else None
        coords = None
        if s.geom is not None:
            try:
                pt = to_shape(s.geom)
                coords = {"lat": pt.y, "lon": pt.x}
            except Exception:
                pass
        commune, code_adm = _resolve_commune(db, s.geom)
        out.append({
            "id": s.id,
            "reference_suivi": s.reference_suivi,
            "type": s.type,
            "statut": s.statut,
            "motif_rejet": s.motif_rejet,
            "incident_id": s.incident_id,
            "verifie_par_nom": verif.nom if verif else None,
            "verifie_le": s.verifie_le.isoformat() if s.verifie_le else None,
            "cree_le": s.cree_le.isoformat() if s.cree_le else None,
            "coords": coords,
            "commune": commune,
            "code_adm": code_adm,
        })
    return out


@router.get("/{sid}")
def detail_signalement(
    sid: int,
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(require_role("verificateur", "coordinateur")),
):
    """Détail d'un signalement individuel."""
    s = db.get(Signalement, sid)
    if s is None:
        _not_found()
    suggestions = suggerer_doublons(db, s) if s.statut == "recu" else []
    return _signalement_to_dict(s, suggestions, db)


@router.post("/{sid}/valider")
def valider(
    sid: int,
    db: Session = Depends(get_db),
    user: Utilisateur = Depends(require_role("verificateur", "coordinateur")),
):
    s = db.get(Signalement, sid)
    if s is None:
        _not_found()
    if s.statut != "recu":
        raise HTTPException(409, "Ce signalement a déjà été traité.")

    zone_id = None
    if s.geom is not None:
        with contextlib.suppress(Exception):
            zone_id = db.scalar(select(Zone.id).where(func.ST_Intersects(Zone.geom, s.geom)).limit(1))

    incident = Incident(
        reference_publique=uuid4().hex,
        type=s.type,
        geom=s.geom,
        zone_id=zone_id,
        statut="ouvert",
        niveau_fiabilite="declare",
        danger_immediat=s.danger_immediat,
        score_priorite=score_priorite(s.danger_immediat, s.gravite, s.hauteur_eau_cm, danger_type=s.danger_type),
        cree_le=datetime.now(UTC),
        maj_le=datetime.now(UTC),
    )
    db.add(incident)
    db.flush()
    transition_signalement(db, s, "valide", user.id, incident_id=incident.id)
    db.commit()
    return {"ok": True, "incident_id": incident.id, "reference_publique": incident.reference_publique}


@router.post("/{sid}/fusionner/{incident_id}")
def fusionner(
    sid: int,
    incident_id: int,
    db: Session = Depends(get_db),
    user: Utilisateur = Depends(require_role("verificateur", "coordinateur")),
):
    s = db.get(Signalement, sid)
    incident = db.get(Incident, incident_id)
    if s is None:
        _not_found()
    if incident is None:
        raise HTTPException(404, "Incident cible introuvable.")
    if s.statut != "recu":
        raise HTTPException(409, "Ce signalement a déjà été traité.")
    suggestions = {item.id for item in suggerer_doublons(db, s)}
    if incident.id not in suggestions:
        raise HTTPException(
            409,
            "Fusion refusée : l'incident ne répond pas aux critères de doublon (type, distance, délai ou statut).",
        )
    transition_signalement(db, s, "doublon", user.id, incident_id=incident.id)
    incident.niveau_fiabilite = "corrobore"
    incident.score_priorite = max(
        incident.score_priorite,
        score_priorite(s.danger_immediat, s.gravite, s.hauteur_eau_cm, danger_type=s.danger_type),
    )
    db.commit()
    return {"ok": True, "incident_id": incident.id}


@router.post("/{sid}/rejeter")
def rejeter(
    sid: int,
    motif: str,
    db: Session = Depends(get_db),
    user: Utilisateur = Depends(require_role("verificateur", "coordinateur")),
):
    s = db.get(Signalement, sid)
    if s is None:
        _not_found()
    if s.statut != "recu":
        raise HTTPException(409, "Ce signalement a déjà été traité.")
    if not motif.strip():
        raise HTTPException(422, "Motif obligatoire.")
    transition_signalement(db, s, "rejete", user.id, motif=motif)
    db.commit()
    return {"ok": True}


@router.get("/{sid}/doublons")
def doublons(
    sid: int,
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(require_role("verificateur", "coordinateur")),
):
    s = db.get(Signalement, sid)
    if s is None:
        _not_found()
    coords = None
    if s.geom is not None:
        with contextlib.suppress(Exception):
            pt = to_shape(s.geom)
            coords = {"lat": pt.y, "lon": pt.x}
    return [_serialize_doublon(db, coords, i) for i in suggerer_doublons(db, s)]

