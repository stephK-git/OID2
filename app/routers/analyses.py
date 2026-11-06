"""Routeur des analyses spatiales géomatiques (Phase 3 SIG — Lots 1 & 2 : EPSG:32630, DBSCAN, Gi*, Poisson)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.db.session import get_db
from app.models.utilisateur import Utilisateur
from app.services.sig_analyses import (
    calculer_getis_ord_gi_star,
    calculer_indices_vulnerabilite,
    detecter_points_chauds,
    detecter_zones_silencieuses,
    generer_rapport_retex_pdf,
    obtenir_communes_geojson,
    obtenir_mailles_population_geojson,
    obtenir_metadonnees_sig,
)

router = APIRouter(prefix="/analyses", tags=["analyses-sig"])


@router.get("/metadonnees")
def api_metadonnees_sig(
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(require_role("coordinateur", "verificateur")),
):
    """Retourne la fiche méthodologique SIG complète (EPSG:32630, OSM, WorldPop, MNT, formules Lot 2)."""
    return obtenir_metadonnees_sig(db)


@router.get("/communes")
def api_communes_geojson(
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(require_role("coordinateur", "verificateur")),
):
    """Retourne les 13 communes réelles d'Abidjan en GeoJSON avec population WorldPop et classes de Jenks."""
    return obtenir_communes_geojson(db)


@router.get("/mailles-population")
def api_mailles_population_geojson(
    zone_id: Annotated[int | None, Query(description="Filtrer sur l'identifiant d'une commune")] = None,
    thematique: Annotated[
        str,
        Query(
            pattern="^(densite|alea|vulnerabilite)$",
            description="Variable représentée sur les hexagones 300 m : densite, alea ou vulnerabilite",
        ),
    ] = "densite",
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(require_role("coordinateur", "verificateur")),
):
    """Retourne la grille hexagonale métrique (300 m, EPSG:32630) discrétisée par Fisher-Jenks."""
    return obtenir_mailles_population_geojson(db, zone_id=zone_id, thematique=thematique)


@router.get("/getis-ord")
def api_getis_ord_gi_star(
    rayon_voisinage_m: Annotated[
        float,
        Query(ge=300.0, le=3000.0, description="Rayon euclidien de voisinage en mètres (EPSG:32630)"),
    ] = 900.0,
    zone_id: Annotated[int | None, Query(description="Filtrer l'affichage sur une commune")] = None,
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(require_role("coordinateur", "verificateur")),
):
    """Calcule la statistique locale d'autocorrélation Getis-Ord Gi* (z-score et p-value) sur mailles 300 m."""
    return calculer_getis_ord_gi_star(db, rayon_voisinage_m=rayon_voisinage_m, zone_id=zone_id)


@router.get("/points-chauds")
def api_points_chauds(
    eps_m: Annotated[
        float,
        Query(ge=100.0, le=2500.0, description="Distance DBSCAN eps en mètres (EPSG:32630)"),
    ] = 450.0,
    min_points: Annotated[
        int,
        Query(ge=2, le=20, description="Effectif minimal minpoints d'un cluster DBSCAN"),
    ] = 2,
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(require_role("coordinateur", "verificateur")),
):
    """Identifie les corridors d'inondation via ST_ClusterDBSCAN + ST_ConcaveHull en EPSG:32630."""
    return detecter_points_chauds(db, eps_m=eps_m, min_points=min_points)


@router.get("/vulnerabilite")
def api_vulnerabilite(
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(require_role("coordinateur", "verificateur")),
):
    """Calcule l'indice multicritère documenté (Aléa × Exposition × Vulnérabilité, Fisher-Jenks)."""
    return calculer_indices_vulnerabilite(db)


@router.get("/zones-silencieuses")
def api_zones_silencieuses(
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(require_role("coordinateur", "verificateur")),
):
    """Détecte les anomalies de sous-signalement par modèle de Poisson Observé / Attendu."""
    return detecter_zones_silencieuses(db)


@router.get("/retex.pdf")
def api_rapport_retex_pdf(
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(require_role("coordinateur")),
):
    """Génère et télécharge le rapport officiel RETEX (Retour d'Expérience) en PDF."""
    pdf_bytes = generer_rapport_retex_pdf(db)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="OID-RETEX-Post-Crise.pdf"'},
    )
