import csv
from datetime import UTC, datetime
from io import StringIO

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
from app.models.utilisateur import Utilisateur
from app.models.zone import Zone
from app.schemas.incident import IncidentAffecterIn as AffectationIn
from app.schemas.incident import IncidentRouvrirIn as RouverturIn
from app.schemas.utilisateur import UtilisateurCreateIn as UtilisateurIn
from app.services.statuts import transition_incident

router = APIRouter(prefix="/coordination", tags=["coordination"])

ROLES_VALIDES = {"verificateur", "enqueteur", "coordinateur"}


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
    return [
        {
            "id": i.id,
            "reference_publique": i.reference_publique,
            "type": i.type,
            "statut": i.statut,
            "score_priorite": i.score_priorite,
            "niveau_fiabilite": i.niveau_fiabilite,
            "enqueteur_id": i.enqueteur_id,
            "danger_immediat": i.danger_immediat,
            "cree_le": i.cree_le.isoformat() if i.cree_le else None,
            "maj_le": i.maj_le.isoformat() if i.maj_le else None,
        }
        for i in rows
    ]


@router.get("/incidents/{iid}")
def detail_incident(
    iid: int,
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(require_role("coordinateur", "verificateur")),
):
    inc = db.get(Incident, iid)
    if inc is None:
        raise HTTPException(404, "Incident introuvable.")
    enqueteur = db.get(Utilisateur, inc.enqueteur_id) if inc.enqueteur_id else None
    return {
        "id": inc.id,
        "reference_publique": inc.reference_publique,
        "type": inc.type,
        "statut": inc.statut,
        "score_priorite": inc.score_priorite,
        "niveau_fiabilite": inc.niveau_fiabilite,
        "danger_immediat": inc.danger_immediat,
        "enqueteur_id": inc.enqueteur_id,
        "enqueteur_nom": enqueteur.nom if enqueteur else None,
        "cree_le": inc.cree_le.isoformat() if inc.cree_le else None,
        "maj_le": inc.maj_le.isoformat() if inc.maj_le else None,
        "cloture_le": inc.cloture_le.isoformat() if inc.cloture_le else None,
    }


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
    return [
        {
            "id": u.id,
            "nom": u.nom,
            "email": u.email,
            "dossiers_actifs": db.scalar(
                select(func.count()).select_from(Incident).where(
                    Incident.enqueteur_id == u.id,
                    Incident.statut.in_(["affecte", "evalue"]),
                )
            ) or 0,
        }
        for u in users
    ]


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
