from app.services.priorite import score_priorite
from app.services.statuts import TRANSITIONS_INCIDENT, TRANSITIONS_SIGNALEMENT


def test_score_priorite():
    assert score_priorite(danger_immediat=True, gravite="elevee", hauteur_eau_cm=30, corroborations=2) <= 100
    assert score_priorite() >= 0
    assert score_priorite(danger_immediat=True, danger_type="trapped") > score_priorite(danger_immediat=True)


def test_transitions():
    assert "valide" in TRANSITIONS_SIGNALEMENT["recu"]
    assert "affecte" in TRANSITIONS_INCIDENT["ouvert"]
    assert "affecte" in TRANSITIONS_INCIDENT["rouvert"]
    assert "rouvert" in TRANSITIONS_INCIDENT["cloture"]
