"""Rapports SITREP et exports géographiques."""

import csv
import io
from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from fastapi.responses import Response, StreamingResponse
from geoalchemy2.shape import to_shape
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.db.session import get_db
from app.models.evaluation import Evaluation
from app.models.incident import Incident
from app.models.utilisateur import Utilisateur

router = APIRouter(prefix="/rapports", tags=["rapports"])


def _sitrep_data(db: Session):
    incidents = db.scalars(select(Incident).order_by(Incident.cree_le.desc())).all()
    latest = (
        select(func.max(Evaluation.id).label("evaluation_id"))
        .where(Evaluation.statut == "soumise")
        .group_by(Evaluation.incident_id)
        .subquery()
    )
    impact = db.execute(
        select(
            func.count(Evaluation.id),
            func.coalesce(func.sum(Evaluation.menages_touches), 0),
            func.coalesce(func.sum(Evaluation.personnes_affectees), 0),
            func.coalesce(func.sum(Evaluation.blesses), 0),
            func.coalesce(func.sum(Evaluation.deplaces), 0),
            func.coalesce(func.sum(Evaluation.deces), 0),
            func.coalesce(func.sum(Evaluation.disparus), 0),
        ).join(latest, Evaluation.id == latest.c.evaluation_id)
    ).one()
    return {
        "date": datetime.now(UTC).isoformat(),
        "incidents_total": len(incidents),
        "incidents_ouverts": sum(i.statut in ("ouvert", "affecte", "rouvert") for i in incidents),
        "incidents_evalues": sum(i.statut in ("evalue", "cloture") for i in incidents),
        "incidents_clotures": sum(i.statut == "cloture" for i in incidents),
        "evaluations_comptabilisees": int(impact[0]),
        "menages_touches": int(impact[1]),
        "personnes_affectees": int(impact[2]),
        "blesses": int(impact[3]),
        "deplaces": int(impact[4]),
        "deces": int(impact[5]),
        "disparus": int(impact[6]),
        "couverture": f"{int(impact[0])}/{len(incidents)}",
        "detail": [
            {
                "id": i.id,
                "reference": i.reference_publique,
                "type": i.type,
                "statut": i.statut,
                "score_priorite": i.score_priorite,
            }
            for i in incidents
        ],
    }


@router.get("/sitrep")
def sitrep(
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(require_role("coordinateur")),
):
    return _sitrep_data(db)


@router.get("/sitrep.pdf")
def sitrep_pdf(
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(require_role("coordinateur")),
):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    data = _sitrep_data(db)
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=18 * mm, leftMargin=18 * mm)
    styles = getSampleStyleSheet()
    story = [
        Paragraph("O.I.D — Rapport de situation (SITREP)", styles["Title"]),
        Paragraph(f"Généré le : {data['date']}", styles["Normal"]),
        Spacer(1, 8 * mm),
    ]
    rows = [
        ["Indicateur", "Valeur"],
        ["Incidents recensés", str(data["incidents_total"])],
        ["Incidents ouverts / affectés", str(data["incidents_ouverts"])],
        ["Incidents évalués / clôturés", str(data["incidents_evalues"])],
        ["Couverture des évaluations", data["couverture"]],
        ["Ménages touchés", str(data["menages_touches"])],
        ["Personnes affectées", str(data["personnes_affectees"])],
        ["Blessés", str(data["blesses"])],
        ["Déplacés", str(data["deplaces"])],
        ["Décès", str(data["deces"])],
        ["Disparus", str(data["disparus"])],
    ]
    table = Table(rows, colWidths=[105 * mm, 55 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0B1F3A")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")),
        ("PADDING", (0, 0), (-1, -1), 7),
        ("BACKGROUND", (0, 1), (-1, -1), colors.white),
    ]))
    story.extend([table, Spacer(1, 6 * mm), Paragraph(
        "Les chiffres d'impact proviennent des évaluations soumises. "
        "La couverture indique le nombre d'évaluations comptabilisées rapporté au nombre total d'incidents.",
        styles["BodyText"],
    )])
    doc.build(story)
    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="OID-SITREP.pdf"'},
    )


@router.get("/export/geojson")
def export_geojson(
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(require_role("coordinateur")),
):
    features = []
    for incident in db.scalars(select(Incident)).all():
        geom = to_shape(incident.geom)
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [geom.x, geom.y]},
            "properties": {
                "id": incident.id,
                "reference_publique": incident.reference_publique,
                "type": incident.type,
                "statut": incident.statut,
                "score_priorite": incident.score_priorite,
                "niveau_fiabilite": incident.niveau_fiabilite,
            },
        })
    return {"type": "FeatureCollection", "features": features}


@router.get("/export/csv")
def export_csv(
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(require_role("coordinateur")),
):
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["id", "reference_publique", "type", "statut", "score_priorite", "niveau_fiabilite"])
    for i in db.scalars(select(Incident).order_by(Incident.id)).all():
        writer.writerow([i.id, i.reference_publique, i.type, i.statut, i.score_priorite, i.niveau_fiabilite])
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=incidents.csv"},
    )
