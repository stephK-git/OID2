"""Initialisation opérationnelle des comptes de référence, des 13 communes réelles et d'incidents types."""

import json
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.evaluation import Evaluation
from app.models.incident import Incident
from app.models.signalement import Signalement
from app.models.utilisateur import Utilisateur
from app.models.zone import Zone
from geoalchemy2.shape import from_shape
from shapely.geometry import MultiPolygon, Point, Polygon, shape
from sqlalchemy import select

COMMUNES_GEOJSON_PATH = ROOT_DIR / "data" / "geo" / "abidjan_13_communes.geojson"

USERS_INIT = [
    ("Vérificateur Permanence", "verificateur@oid.demo", "demo1234", "verificateur", None),
    ("Enquêteur Terrain Principal", "enqueteur@oid.demo", "demo1234", "enqueteur", None),
    ("Coordinateur Cellule Crise", "coordinateur@oid.demo", "demo1234", "coordinateur", None),
    ("Enquêteur Secteur Cocody", "enqueteur.cocody@oid.demo", "demo1234", "enqueteur", "Cocody"),
    # Comptes alignés sur les boutons de démonstration de LoginPage.tsx
    ("Vérificateur Permanence", "verificateur@oid.org", "Demo1234!", "verificateur", None),
    ("Enquêteur Terrain Principal", "enqueteur@oid.org", "Demo1234!", "enqueteur", None),
    ("Coordinateur Cellule Crise", "coordinateur@oid.org", "Demo1234!", "coordinateur", None),
]


def _ensure_multipolygon(geom_dict: dict) -> MultiPolygon:
    g = shape(geom_dict)
    if isinstance(g, Polygon):
        return MultiPolygon([g])
    if isinstance(g, MultiPolygon):
        return g
    raise ValueError(f"Géométrie inattendue : {g.geom_type}")


def main():
    db = SessionLocal()
    try:
        # 1. Chargement des 13 communes réelles depuis data/geo/abidjan_13_communes.geojson
        zone_map: dict[str, Zone] = {z.nom: z for z in db.scalars(select(Zone)).all()}
        if not zone_map and COMMUNES_GEOJSON_PATH.exists():
            fc = json.loads(COMMUNES_GEOJSON_PATH.read_text(encoding="utf-8"))
            for feat in fc.get("features", []):
                props = feat["properties"]
                z = Zone(
                    nom=props["nom"],
                    code_adm=props.get("code_adm"),
                    population_totale=props.get("population_totale"),
                    superficie_km2=props.get("superficie_km2"),
                    densite_hab_km2=props.get("densite_hab_km2"),
                    source_geom=props.get("source_geom"),
                    geom=from_shape(_ensure_multipolygon(feat["geometry"]), srid=4326),
                )
                db.add(z)
                db.flush()
                zone_map[z.nom] = z
            db.commit()

        # 2. Comptes opérationnels
        user_map: dict[str, Utilisateur] = {}
        for nom, email, raw_password, role, zone_nom in USERS_INIT:
            email_clean = email.strip().lower()
            u = db.scalar(select(Utilisateur).where(Utilisateur.email == email_clean))
            if u is None:
                u = Utilisateur(
                    nom=nom,
                    email=email_clean,
                    mot_de_passe_hash=hash_password(raw_password),
                    role=role,
                    zone_id=zone_map[zone_nom].id if zone_nom and zone_nom in zone_map else None,
                    actif=True,
                )
                db.add(u)
                db.flush()
            user_map[role] = u
        db.commit()

        # 3. Signalements en file de triage (bassins inondables réels d'Abidjan)
        cnt_sig = db.query(Signalement).count()
        now = datetime.now(UTC)
        if cnt_sig == 0:
            sig_samples = [
                Signalement(
                    reference_suivi="SIG-ABJ-001",
                    type="habitation",
                    geom=from_shape(Point(-3.9562, 5.3678), srid=4326),  # Riviera Palmeraie / Rue Ministre (Cocody)
                    hauteur_eau_cm=95.0,
                    gravite="elevee",
                    danger_immediat=True,
                    danger_type="trapped",
                    description="Montée rapide des eaux dans la cuvette de la Palmeraie, ménages bloqués au rez-de-chaussée.",
                    statut="recu",
                    cree_le=now - timedelta(minutes=25),
                ),
                Signalement(
                    reference_suivi="SIG-ABJ-002",
                    type="rue",
                    geom=from_shape(Point(-4.0768, 5.3442), srid=4326),  # Yopougon Wassakara
                    hauteur_eau_cm=55.0,
                    gravite="moyenne",
                    danger_immediat=False,
                    danger_type=None,
                    description="Chaussée submergée au niveau du bas-fond de Wassakara, circulation interrompue.",
                    statut="recu",
                    cree_le=now - timedelta(minutes=40),
                ),
                Signalement(
                    reference_suivi="SIG-ABJ-003",
                    type="infrastructure",
                    geom=from_shape(Point(-4.0175, 5.3418), srid=4326),  # Carrefour de l'Indénié (Adjamé / Cocody)
                    hauteur_eau_cm=120.0,
                    gravite="elevee",
                    danger_immediat=True,
                    danger_type="electric",
                    description="Submersion du carrefour de l'Indénié et d'un coffret électrique basse tension.",
                    statut="recu",
                    cree_le=now - timedelta(minutes=12),
                ),
            ]
            db.add_all(sig_samples)
            db.commit()

        # 4. Incidents qualifiés sur secteurs critiques réels d'Abidjan
        cnt_inc = db.query(Incident).count()
        enqueteur = user_map.get("enqueteur")
        if cnt_inc == 0 and enqueteur:
            inc_specs = [
                ("INC-ABJ-101", "habitation", -3.9558, 5.3684, "Cocody", "affecte", "corrobore", 88.0, True, 3),
                ("INC-ABJ-102", "rue", -4.0805, 5.3402, "Yopougon", "evalue", "verifie", 65.0, False, 20),
                ("INC-ABJ-103", "habitation", -3.9472, 5.2974, "Koumassi", "ouvert", "corrobore", 78.0, True, 5),
                ("INC-ABJ-104", "glissement", -4.0364, 5.3489, "Attécoubé", "affecte", "verifie", 92.0, True, 6),
                ("INC-ABJ-105", "habitation", -4.0210, 5.4245, "Abobo", "ouvert", "declare", 72.0, False, 8),
            ]
            created_incs: list[Incident] = []
            for ref, typ, lon, lat, z_nom, stat, fiab, prio, dng, h_ago in inc_specs:
                inc = Incident(
                    reference_publique=ref,
                    type=typ,
                    geom=from_shape(Point(lon, lat), srid=4326),
                    zone_id=zone_map[z_nom].id if z_nom in zone_map else None,
                    statut=stat,
                    niveau_fiabilite=fiab,
                    score_priorite=prio,
                    danger_immediat=dng,
                    enqueteur_id=enqueteur.id if stat in ("affecte", "evalue") else None,
                    cree_le=now - timedelta(hours=h_ago),
                    maj_le=now - timedelta(hours=max(1, h_ago - 2)),
                )
                db.add(inc)
                created_incs.append(inc)
            db.flush()

            ev = Evaluation(
                incident_id=created_incs[1].id,
                enqueteur_id=enqueteur.id,
                statut="soumise",
                menages_touches=18,
                personnes_affectees=84,
                blesses=2,
                deplaces=31,
                deces=0,
                disparus=0,
                degats="Habitations basses inondées jusqu'à 65 cm, murs mitoyens fragilisés.",
                routes_coupees="Axe secondaire Niangon / Wassakara coupé sur 180 m.",
                risques_sanitaires="Mise en charge des ouvrages d'assainissement pluvial.",
                besoins="Motopompes, kits d'hygiène, hébergement temporaire.",
                recommandations="Curage d'urgence du collecteur primaire.",
                soumise_le=now - timedelta(hours=4),
            )
            db.add(ev)
            db.commit()

        print("Initialisation des comptes et données opérationnelles terminée.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
