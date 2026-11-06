"""Modèle photo (Tranche 2)."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Photo(Base):
    __tablename__ = "photo"

    id: Mapped[int] = mapped_column(primary_key=True)
    signalement_id: Mapped[int | None] = mapped_column(ForeignKey("signalement.id"), nullable=True)
    evaluation_id: Mapped[int | None] = mapped_column(ForeignKey("evaluation.id"), nullable=True)
    url: Mapped[str] = mapped_column(String(500))
    cree_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
