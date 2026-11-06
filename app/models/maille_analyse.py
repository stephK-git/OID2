"""Modèle maille d'analyse hexagonale métrique (PostGIS ST_HexagonGrid EPSG:32630)."""

from geoalchemy2 import Geometry
from sqlalchemy import Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MailleAnalyse(Base):
    __tablename__ = "maille_analyse"

    id: Mapped[int] = mapped_column(primary_key=True)
    code_maille: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    zone_id: Mapped[int | None] = mapped_column(ForeignKey("zone.id"), index=True, nullable=True)
    cote_m: Mapped[int] = mapped_column(Integer, default=300)
    superficie_km2: Mapped[float] = mapped_column(Float, default=0.233827)
    population_worldpop: Mapped[float] = mapped_column(Float, default=0.0)
    densite_hab_km2: Mapped[float] = mapped_column(Float, default=0.0)
    # Attributs topographiques / hydrologiques préparés pour le Lot 2
    dist_hydro_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    altitude_moy_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    indice_alea: Mapped[float | None] = mapped_column(Float, nullable=True)
    geom = mapped_column(Geometry("POLYGON", srid=4326), nullable=False)

