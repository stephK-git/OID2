import contextlib
import csv
from datetime import UTC, datetime
from io import StringIO
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from geoalchemy2.shape import to_shape
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.core.security import hash_password
from app.db.session import get_db
from app.models.audit_log import AuditLog
from app.models.evaluation import Evaluation
from app.models.incident import Incident
from app.models.photo import Photo
from app.models.signalement import Signalement
from app.models.utilisateur import Utilisateur
from app.models.zone import Zone
from app.routers.verification import _resolve_commune
from app.schemas.incident import IncidentAffecterIn as AffectationIn
from app.schemas.incident import IncidentRouvrirIn as RouverturIn
from app.schemas.utilisateur import UtilisateurCreateIn as UtilisateurIn
from app.services.photos import inspect_photo_metadata
from app.services.statuts import transition_incident

router = APIRouter(prefix="/coordination", tags=["coordination"])

ROLES_VALIDES = {"verificateur", "enqueteur", "coordinateur"}
PHOTO_UPLOAD_DIR = Path(__file__).resolve().parent.parent / "static" / "uploads"


def _serialize_incident(db: Session, inc: Incident, include_details: bool = True) -> dict:
    """Sérialise un incident avec ses coordonnées, commune PostGIS, signalements liés et évaluation."""
    coords = None
    if inc.geom is not None:
        with contextlib.suppress(Exception):
            pt = to_shape(inc.geom)
            coords = {"lat": pt.y, "lon": pt.x}

    commune = None
    code_adm = None
    if inc.zone_id:
        with contextlib.suppress(Exception):
            z = db.get(Zone, inc.zone_id)
            if z:
                commune = z.nom
                code_adm = z.code_adm
    if not commune and inc.geom is not None:
        commune, code_adm = _resolve_commune(db, inc.geom)

    enqueteur = db.get(Utilisateur, inc.enqueteur_id) if inc.enqueteur_id else None

    sigs = []
    if include_details:
        with contextlib.suppress(Exception):
            sigs = list(
                db.scalars(
                    select(Signalement)
                    .where(Signalement.incident_id == inc.id)
                    .order_by(Signalement.cree_le.desc())
                ).all()
            )

    hauteur_max = None
    gravite_max = "moyenne"
    grav_rank = {"faible": 1, "moyenne": 2, "elevee": 3, "élevée": 3, "critique": 4}
    best_rank = 0
    description_synthese = None
    signalements_lies = []

    for s in sigs:
        if s.hauteur_eau_cm is not None:
            if hauteur_max is None or float(s.hauteur_eau_cm) > hauteur_max:
                hauteur_max = float(s.hauteur_eau_cm)
        rk = grav_rank.get((s.gravite or "").lower(), 2)
        if rk > best_rank:
            best_rank = rk
            gravite_max = s.gravite or "moyenne"
        if not description_synthese and s.description:
            description_synthese = s.description

        photos_urls = []
        photos_meta = []
        with contextlib.suppress(Exception):
            photos = db.scalars(select(Photo).where(Photo.signalement_id == s.id)).all()
            photos_urls = [p.url for p in photos]
            photos_meta = [
                inspect_photo_metadata(p.url, PHOTO_UPLOAD_DIR) for p in photos
            ]

        signalements_lies.append(
            {
                "id": s.id,
                "reference_suivi": s.reference_suivi,
                "type": s.type,
                "hauteur_eau_cm": s.hauteur_eau_cm,
                "gravite": s.gravite,
                "danger_immediat": s.danger_immediat,
                "danger_type": s.danger_type,
                "description": s.description,
                "statut": s.statut,
                "cree_le": s.cree_le.isoformat() if s.cree_le else None,
                "photos": photos_urls,
                "photos_meta": photos_meta,
            }
        )

    eval_data = None
    if include_details:
        with contextlib.suppress(Exception):
            ev = db.scalar(
                select(Evaluation)
                .where(Evaluation.incident_id == inc.id)
                .order_by(Evaluation.id.desc())
                .limit(1)
            )
            if ev:
                eval_photos_rows = db.scalars(
                    select(Photo).where(Photo.evaluation_id == ev.id)
                ).all()
                eval_photos = [p.url for p in eval_photos_rows]
                eval_photos_meta = [
                    inspect_photo_metadata(p.url, PHOTO_UPLOAD_DIR) for p in eval_photos_rows
                ]
                eval_data = {
                    "id": ev.id,
                    "statut": ev.statut,
                    "menages_touches": ev.menages_touches,
                    "personnes_affectees": ev.personnes_affectees,
                    "blesses": ev.blesses,
                    "deplaces": ev.deplaces,
                    "deces": ev.deces,
                    "disparus": ev.disparus,
                    "degats": ev.degats,
                    "routes_coupees": ev.routes_coupees,
                    "risques_sanitaires": ev.risques_sanitaires,
                    "besoins": ev.besoins,
                    "recommandations": ev.recommandations,
                    "soumise_le": ev.soumise_le.isoformat() if ev.soumise_le else None,
                    "photos": eval_photos,
                    "photos_meta": eval_photos_meta,
                }

    return {
        "id": inc.id,
        "reference_publique": inc.reference_publique,
        "type": inc.type,
        "statut": inc.statut,
        "score_priorite": inc.score_priorite,
        "niveau_fiabilite": inc.niveau_fiabilite,
        "enqueteur_id": inc.enqueteur_id,
        "enqueteur_nom": enqueteur.nom if enqueteur else None,
        "danger_immediat": inc.danger_immediat,
        "zone_id": inc.zone_id,
        "commune": commune,
        "code_adm": code_adm,
        "coords": coords,
        "nb_signalements": max(len(signalements_lies), 1),
        "hauteur_eau_max_cm": hauteur_max,
        "gravite_max": gravite_max,
        "description_synthese": description_synthese,
        "signalements_lies": signalements_lies,
        "evaluation": eval_data,
        "cree_le": inc.cree_le.isoformat() if inc.cree_le else None,
        "maj_le": inc.maj_le.isoformat() if inc.maj_le else None,
        "cloture_le": inc.cloture_le.isoformat() if inc.cloture_le else None,
    }


@router.get("/zones")
def liste_zones(
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(require_role("coordinateur", "verificateur", "enqueteur")),
):
    """Retourne la liste des zones opérationnelles."""
    zones = db.scalars(select(Zone).order_by(Zone.nom)).all()
    return [{"id": z.id, "nom": z.nom} for z in zones]


# ---------------------------------------------------------------------------
# Incidents
# ---------------------------------------------------------------------------

@router.get("/incidents")
def liste_incidents(
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(require_role("coordinateur", "verificateur")),
):
    rows = db.scalars(select(Incident).order_by(Incident.score_priorite.desc(), Incident.cree_le.desc())).all()
    return [_serialize_incident(db, i, include_details=True) for i in rows]


@router.get("/incidents/{iid}")
def detail_incident(
    iid: int,
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(require_role("coordinateur", "verificateur")),
):
    inc = db.get(Incident, iid)
    if inc is None:
        raise HTTPException(404, "Incident introuvable.")
    return _serialize_incident(db, inc, include_details=True)


@router.get("/carte")
def carte_incidents(
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(require_role("coordinateur", "verificateur")),
):
    features = []
    for i in db.scalars(select(Incident)).all():
        try:
            point = to_shape(i.geom)
        except Exception:
            continue
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [point.x, point.y]},
            "properties": {
                "id": i.id,
                "type": i.type,
                "statut": i.statut,
                "score_priorite": i.score_priorite,
                "danger_immediat": i.danger_immediat,
                "reference_publique": i.reference_publique,
                "zone_id": i.zone_id,
            },
        })
    return {"type": "FeatureCollection", "features": features}


@router.post("/incidents/{iid}/affecter")
def affecter(
    iid: int,
    body: AffectationIn,
    db: Session = Depends(get_db),
    user: Utilisateur = Depends(require_role("coordinateur")),
):
    inc = db.get(Incident, iid)
    if inc is None:
        raise HTTPException(404, "Incident introuvable.")
    enqueteur = db.get(Utilisateur, body.enqueteur_id)
    if enqueteur is None or not enqueteur.actif or enqueteur.role != "enqueteur":
        raise HTTPException(422, "Le compte choisi n'est pas un enquêteur actif.")
    if inc.statut not in ("ouvert", "rouvert"):
        raise HTTPException(409, "Seul un incident ouvert ou rouvert peut être affecté.")
    inc.enqueteur_id = enqueteur.id
    try:
        transition_incident(db, inc, "affecte", user.id)
        db.commit()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(409, str(exc)) from exc
    return {"ok": True, "incident_id": inc.id, "enqueteur_id": enqueteur.id}


@router.post("/incidents/{iid}/cloturer")
def cloturer(
    iid: int,
    db: Session = Depends(get_db),
    user: Utilisateur = Depends(require_role("coordinateur")),
):
    inc = db.get(Incident, iid)
    if inc is None:
        raise HTTPException(404, "Incident introuvable.")
    try:
        transition_incident(db, inc, "cloture", user.id)
        db.commit()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(409, str(exc)) from exc
    return {"ok": True}


@router.post("/incidents/{iid}/rouvrir")
def rouvrir(
    iid: int,
    body: RouverturIn,
    db: Session = Depends(get_db),
    user: Utilisateur = Depends(require_role("coordinateur")),
):
    inc = db.get(Incident, iid)
    if inc is None:
        raise HTTPException(404, "Incident introuvable.")
    try:
        transition_incident(db, inc, "rouvert", user.id, body.motif)
        db.commit()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(409, str(exc)) from exc
    return {"ok": True}


@router.get("/stats")
def stats(
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(require_role("coordinateur")),
):
    total = db.scalar(select(func.count()).select_from(Incident)) or 0
    ouverts = db.scalar(
        select(func.count()).select_from(Incident).where(
            Incident.statut.in_(["ouvert", "affecte", "rouvert"])
        )
    ) or 0
    evalues = db.scalar(
        select(func.count()).select_from(Incident).where(
            Incident.statut.in_(["evalue", "cloture"])
        )
    ) or 0

    # Calcul des retards SLA sur les incidents non clôturés
    now = datetime.now(UTC)
    non_clotures = db.scalars(
        select(Incident).where(Incident.statut.in_(["ouvert", "affecte", "rouvert"]))
    ).all()
    retard_critique = 0
    retard_standard = 0
    for inc in non_clotures:
        if inc.cree_le:
            dt = inc.cree_le if inc.cree_le.tzinfo else inc.cree_le.replace(tzinfo=UTC)
            age = (now - dt).total_seconds()
            if inc.danger_immediat and age > 900:  # 15 min
                retard_critique += 1
            elif not inc.danger_immediat and age > 7200:  # 2 h
                retard_standard += 1

    # Répartition par statut
    par_statut = {}
    for st in ["ouvert", "affecte", "evalue", "cloture", "rouvert"]:
        cnt = db.scalar(select(func.count()).select_from(Incident).where(Incident.statut == st)) or 0
        par_statut[st] = cnt

    # Répartition par type
    types_rows = db.execute(
        select(Incident.type, func.count()).group_by(Incident.type)
    ).all()
    par_type = {t: c for t, c in types_rows}

    latest = (
        select(func.max(Evaluation.id).label("evaluation_id"))
        .where(Evaluation.statut == "soumise")
        .group_by(Evaluation.incident_id)
        .subquery()
    )
    impacts = db.execute(
        select(
            func.coalesce(func.sum(Evaluation.menages_touches), 0),
            func.coalesce(func.sum(Evaluation.personnes_affectees), 0),
            func.coalesce(func.sum(Evaluation.blesses), 0),
            func.coalesce(func.sum(Evaluation.deplaces), 0),
            func.coalesce(func.sum(Evaluation.deces), 0),
            func.coalesce(func.sum(Evaluation.disparus), 0),
        )
        .join(latest, Evaluation.id == latest.c.evaluation_id)
    ).one()
    return {
        "incidents": total,
        "ouverts": ouverts,
        "evalues": evalues,
        "couverture": f"{evalues}/{total}",
        "retard_critique": retard_critique,
        "retard_standard": retard_standard,
        "retards_total": retard_critique + retard_standard,
        "par_statut": par_statut,
        "par_type": par_type,
        "menages_touches": int(impacts[0]),
        "personnes_affectees": int(impacts[1]),
        "blesses": int(impacts[2]),
        "deplaces": int(impacts[3]),
        "deces": int(impacts[4]),
        "disparus": int(impacts[5]),
    }


@router.get("/enqueteurs")
def liste_enqueteurs(
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(require_role("coordinateur")),
):
    users = db.scalars(
        select(Utilisateur).where(Utilisateur.role == "enqueteur", Utilisateur.actif.is_(True))
    ).all()
    zones_map = {z.id: z.nom for z in db.scalars(select(Zone)).all()}
    items = [
        {
            "id": u.id,
            "nom": u.nom,
            "email": u.email,
            "zone_id": u.zone_id,
            "zone_nom": zones_map.get(u.zone_id) if u.zone_id else None,
            "dossiers_actifs": db.scalar(
                select(func.count()).select_from(Incident).where(
                    Incident.enqueteur_id == u.id,
                    Incident.statut.in_(["affecte", "evalue"]),
                )
            ) or 0,
        }
        for u in users
    ]
    items.sort(key=lambda x: (x["dossiers_actifs"], x["nom"]))
    return items


# ---------------------------------------------------------------------------
# Gestion des utilisateurs (admin)
# ---------------------------------------------------------------------------

@router.get("/utilisateurs")
def liste_utilisateurs(
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(require_role("coordinateur")),
):
    """Liste tous les comptes utilisateurs."""
    users = db.scalars(select(Utilisateur).order_by(Utilisateur.role, Utilisateur.nom)).all()
    return [
        {
            "id": u.id,
            "nom": u.nom,
            "email": u.email,
            "role": u.role,
            "actif": u.actif,
            "zone_id": u.zone_id,
            "derniere_connexion": u.derniere_connexion.isoformat() if u.derniere_connexion else None,
            "dossiers_actifs": db.scalar(
                select(func.count()).select_from(Incident).where(
                    Incident.enqueteur_id == u.id,
                    Incident.statut.in_(["affecte", "evalue"]),
                )
            ) or 0 if u.role == "enqueteur" else 0,
        }
        for u in users
    ]


class UtilisateurUpdateIn(BaseModel):
    nom: str | None = None
    role: str | None = None
    zone_id: int | None = None


@router.patch("/utilisateurs/{uid}")
def modifier_utilisateur(
    uid: int,
    data: UtilisateurUpdateIn,
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(require_role("coordinateur")),
):
    """Modifie le nom, rôle ou la zone d'un utilisateur."""
    user = db.get(Utilisateur, uid)
    if user is None:
        raise HTTPException(404, "Utilisateur introuvable.")
    if data.nom is not None and data.nom.strip():
        user.nom = data.nom.strip()
    if data.role is not None:
        if data.role not in ROLES_VALIDES:
            raise HTTPException(422, f"Rôle invalide: {data.role}")
        user.role = data.role
    if data.zone_id is not None:
        user.zone_id = data.zone_id if data.zone_id > 0 else None
    db.commit()
    db.refresh(user)
    return {"id": user.id, "nom": user.nom, "role": user.role, "zone_id": user.zone_id, "actif": user.actif}


@router.post("/utilisateurs", status_code=201)
def creer_utilisateur(
    data: UtilisateurIn,
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(require_role("coordinateur")),
):
    """Crée un nouveau compte utilisateur."""
    if data.role not in ROLES_VALIDES:
        raise HTTPException(422, f"Rôle invalide. Valeurs acceptées : {', '.join(sorted(ROLES_VALIDES))}")
    existant = db.scalar(select(Utilisateur).where(Utilisateur.email == data.email.strip().lower()))
    if existant:
        raise HTTPException(409, "Un compte avec cet e-mail existe déjà.")
    user = Utilisateur(
        nom=data.nom.strip(),
        email=data.email.strip().lower(),
        mot_de_passe_hash=hash_password(data.password),
        role=data.role,
        zone_id=data.zone_id,
        actif=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "nom": user.nom, "email": user.email, "role": user.role}


@router.patch("/utilisateurs/{uid}/actif")
def toggle_actif(
    uid: int,
    actif: bool,
    db: Session = Depends(get_db),
    current_user: Utilisateur = Depends(require_role("coordinateur")),
):
    """Active ou désactive un compte utilisateur."""
    user = db.get(Utilisateur, uid)
    if user is None:
        raise HTTPException(404, "Utilisateur introuvable.")
    if user.id == current_user.id:
        raise HTTPException(409, "Vous ne pouvez pas désactiver votre propre compte.")
    user.actif = actif
    db.commit()
    return {"id": user.id, "actif": user.actif}


@router.patch("/utilisateurs/{uid}/mot-de-passe")
def changer_mot_de_passe(
    uid: int,
    nouveau_mot_de_passe: str = Query(..., min_length=8),
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(require_role("coordinateur")),
):
    """Réinitialise le mot de passe d'un utilisateur (coordinateur uniquement)."""
    user = db.get(Utilisateur, uid)
    if user is None:
        raise HTTPException(404, "Utilisateur introuvable.")
    if len(nouveau_mot_de_passe) < 8:
        raise HTTPException(422, "Le mot de passe doit contenir au moins 8 caractères.")
    user.mot_de_passe_hash = hash_password(nouveau_mot_de_passe)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Audit et Journalisation
# ---------------------------------------------------------------------------

@router.get("/audit")
def liste_audit(
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(require_role("coordinateur")),
):
    """Retourne l'historique des actions d'audit."""
    logs = db.scalars(
        select(AuditLog).order_by(AuditLog.cree_le.desc()).limit(limit)
    ).all()
    result = []
    for log in logs:
        user = db.get(Utilisateur, log.utilisateur_id) if log.utilisateur_id else None
        result.append({
            "id": log.id,
            "action": log.action,
            "objet_type": log.objet_type,
            "objet_id": log.objet_id,
            "ancien_statut": log.ancien_statut,
            "nouveau_statut": log.nouveau_statut,
            "motif": log.motif,
            "utilisateur_id": log.utilisateur_id,
            "utilisateur_nom": user.nom if user else "Système",
            "cree_le": log.cree_le.isoformat() if log.cree_le else None,
        })
    return result


@router.get("/audit/export/csv")
def exporter_audit_csv(
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(require_role("coordinateur")),
):
    """Exporte la piste d'audit au format CSV."""
    logs = db.scalars(
        select(AuditLog).order_by(AuditLog.cree_le.desc()).limit(1000)
    ).all()
    output = StringIO()
    writer = csv.writer(output, delimiter=";")
    writer.writerow([
        "ID",
        "Date",
        "Utilisateur",
        "Action",
        "Objet Type",
        "Objet ID",
        "Ancien Statut",
        "Nouveau Statut",
        "Motif",
    ])
    for log in logs:
        user = db.get(Utilisateur, log.utilisateur_id) if log.utilisateur_id else None
        user_label = f"{user.nom} ({user.email})" if user else "Système"
        date_str = log.cree_le.strftime("%Y-%m-%d %H:%M:%S") if log.cree_le else ""
        writer.writerow([
            log.id,
            date_str,
            user_label,
            log.action,
            log.objet_type,
            log.objet_id,
            log.ancien_statut or "",
            log.nouveau_statut or "",
            log.motif or "",
        ])
    output.seek(0)
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=piste_audit_oid.csv"},
    )
