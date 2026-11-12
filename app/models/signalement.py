"""Modèle signalement (Tranche 2)."""

import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Signalement(Base):
    __tablename__ = "signalement"

    id: Mapped[int] = mapped_column(primary_key=True)
    reference_suivi: Mapped[str] = mapped_column(
        String(64),
        unique=True,
        index=True,
        default=lambda: f"OID-{datetime.utcnow().year}-{uuid.uuid4().hex[:6].upper()}",
    )
    incident_id: Mapped[int | None] = mapped_column(ForeignKey("incident.id"), nullable=True)
    type: Mapped[str] = mapped_column(String(40))
    geom = mapped_column(Geometry("POINT", srid=4326))
    hauteur_eau_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    gravite: Mapped[str] = mapped_column(String(20))
    danger_immediat: Mapped[bool] = mapped_column(default=False)
    danger_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    statut: Mapped[str] = mapped_column(String(20), default="recu")
    motif_rejet: Mapped[str | None] = mapped_column(Text, nullable=True)
    verifie_par: Mapped[int | None] = mapped_column(ForeignKey("utilisateur.id"), nullable=True)
    verifie_le: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    empreinte_anonyme: Mapped[str | None] = mapped_column(String(64), nullable=True)
    cree_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
