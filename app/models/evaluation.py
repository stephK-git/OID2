"""Modèle évaluation (Tranche 4)."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Evaluation(Base):
    __tablename__ = "evaluation"

    id: Mapped[int] = mapped_column(primary_key=True)
    incident_id: Mapped[int] = mapped_column(ForeignKey("incident.id"))
    enqueteur_id: Mapped[int] = mapped_column(ForeignKey("utilisateur.id"))
    menages_touches: Mapped[int] = mapped_column(Integer, default=0)
    personnes_affectees: Mapped[int] = mapped_column(Integer, default=0)
    blesses: Mapped[int] = mapped_column(Integer, default=0)
    deplaces: Mapped[int] = mapped_column(Integer, default=0)
    deces: Mapped[int] = mapped_column(Integer, default=0)
    disparus: Mapped[int] = mapped_column(Integer, default=0)
    degats: Mapped[str | None] = mapped_column(Text, nullable=True)
    routes_coupees: Mapped[str | None] = mapped_column(Text, nullable=True)
    risques_sanitaires: Mapped[str | None] = mapped_column(Text, nullable=True)
    besoins: Mapped[str | None] = mapped_column(Text, nullable=True)
    recommandations: Mapped[str | None] = mapped_column(Text, nullable=True)
    statut: Mapped[str] = mapped_column(String(20), default="brouillon")
    soumise_le: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
