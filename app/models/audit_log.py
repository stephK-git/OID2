"""Modèle audit_log (Tranche 3)."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    utilisateur_id: Mapped[int | None] = mapped_column(ForeignKey("utilisateur.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(60))
    objet_type: Mapped[str] = mapped_column(String(40))
    objet_id: Mapped[int] = mapped_column(Integer)
    ancien_statut: Mapped[str | None] = mapped_column(String(40), nullable=True)
    nouveau_statut: Mapped[str | None] = mapped_column(String(40), nullable=True)
    motif: Mapped[str | None] = mapped_column(Text, nullable=True)
    cree_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
