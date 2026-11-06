"""Transitions métier centralisées et journalisées."""

from datetime import UTC, datetime

from app.models.audit_log import AuditLog

TRANSITIONS_SIGNALEMENT = {"recu": {"valide", "rejete", "doublon"}}
TRANSITIONS_INCIDENT = {
    "ouvert": {"affecte"},
    "affecte": {"evalue"},
    "evalue": {"cloture"},
    "cloture": {"rouvert"},
    "rouvert": {"affecte"},  # un incident rouvert peut être réaffecté
}



def _audit(db, utilisateur_id, action, objet_type, objet_id, ancien, nouveau, motif=None):
    db.add(
        AuditLog(
            utilisateur_id=utilisateur_id,
            action=action,
            objet_type=objet_type,
            objet_id=objet_id,
            ancien_statut=ancien,
            nouveau_statut=nouveau,
            motif=motif,
            cree_le=datetime.now(UTC),
        )
    )


def transition_signalement(db, signalement, nouveau, utilisateur_id=None, motif=None, incident_id=None):
    if nouveau not in TRANSITIONS_SIGNALEMENT.get(signalement.statut, set()):
        raise ValueError(f"Transition signalement interdite : {signalement.statut} -> {nouveau}")
    if nouveau == "rejete" and not (motif and motif.strip()):
        raise ValueError("Un motif est obligatoire pour rejeter un signalement.")
    if nouveau == "doublon" and incident_id is None:
        raise ValueError("Un incident cible est obligatoire pour fusionner un doublon.")

    ancien = signalement.statut
    signalement.statut = nouveau
    signalement.verifie_par = utilisateur_id
    signalement.verifie_le = datetime.now(UTC)
    if incident_id is not None:
        signalement.incident_id = incident_id
    if nouveau == "rejete":
        signalement.motif_rejet = motif.strip()
    _audit(db, utilisateur_id, nouveau, "signalement", signalement.id, ancien, nouveau, motif)
    return ancien


def transition_incident(db, incident, nouveau, utilisateur_id=None, motif=None):
    if nouveau not in TRANSITIONS_INCIDENT.get(incident.statut, set()):
        raise ValueError(f"Transition incident interdite : {incident.statut} -> {nouveau}")
    if nouveau == "rouvert" and not (motif and motif.strip()):
        raise ValueError("Un motif est obligatoire pour rouvrir un incident.")

    ancien = incident.statut
    now = datetime.now(UTC)
    incident.statut = nouveau
    incident.maj_le = now
    if nouveau == "cloture":
        incident.cloture_le = now
    elif nouveau == "rouvert":
        incident.cloture_le = None
    _audit(db, utilisateur_id, nouveau, "incident", incident.id, ancien, nouveau, motif)
    return ancien
