"""Calcul du score de priorité (Tranche 3)."""


def score_priorite(danger_immediat=False, gravite="moyenne", hauteur_eau_cm=None, corroborations=0, danger_type=None):
    score = 0
    if danger_immediat:
        score += 40
    if danger_type in {"trapped", "electric"}:
        score += 20
    score += {"faible": 5, "moyenne": 15, "elevee": 25, "élevée": 25}.get(gravite, 15)
    if hauteur_eau_cm:
        score += min(15, int(hauteur_eau_cm // 10))
    score += min(25, corroborations * 5)
    return min(100, score)
