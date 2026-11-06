"""Modèle zone opérationnelle / commune (enrichi SIG Lot 1)."""

from geoalchemy2 import Geometry
from sqlalchemy import Float, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Zone(Base):
    __tablename__ = "zone"

    id: Mapped[int] = mapped_column(primary_key=True)
    nom: Mapped[str] = mapped_column(String(120), unique=True)
    code_adm: Mapped[str | None] = mapped_column(String(32), nullable=True)
    population_totale: Mapped[float | None] = mapped_column(Float, nullable=True)
    superficie_km2: Mapped[float | None] = mapped_column(Float, nullable=True)
    densite_hab_km2: Mapped[float | None] = mapped_column(Float, nullable=True)
    source_geom: Mapped[str | None] = mapped_column(String(160), nullable=True)
    geom = mapped_column(Geometry("MULTIPOLYGON", srid=4326), nullable=True)
