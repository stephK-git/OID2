"""Modèle incident (Tranche 3)."""

from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Incident(Base):
    __tablename__ = "incident"

    id: Mapped[int] = mapped_column(primary_key=True)
    reference_publique: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    type: Mapped[str] = mapped_column(String(40))
    geom = mapped_column(Geometry("POINT", srid=4326))
    zone_id: Mapped[int | None] = mapped_column(ForeignKey("zone.id"), nullable=True)
    statut: Mapped[str] = mapped_column(String(20), default="ouvert")
    niveau_fiabilite: Mapped[str] = mapped_column(String(20), default="declare")
    score_priorite: Mapped[float] = mapped_column(Float, default=0.0)
    danger_immediat: Mapped[bool] = mapped_column(default=False)
    enqueteur_id: Mapped[int | None] = mapped_column(ForeignKey("utilisateur.id"), nullable=True)
    cree_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    maj_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    cloture_le: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
