"""SIG Lot 1 : enrichissement démographique/métrique de zone et table maille_analyse (EPSG:32630).

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a1
Create Date: 2026-11-06 11:40:00.000000
"""

from alembic import op
from geoalchemy2 import Geometry
import sqlalchemy as sa

revision = "c3d4e5f6a7b8"
down_revision = "b2c3d4e5f6a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("zone", sa.Column("code_adm", sa.String(32), nullable=True))
    op.add_column("zone", sa.Column("population_totale", sa.Float(), nullable=True))
    op.add_column("zone", sa.Column("superficie_km2", sa.Float(), nullable=True))
    op.add_column("zone", sa.Column("densite_hab_km2", sa.Float(), nullable=True))
    op.add_column("zone", sa.Column("source_geom", sa.String(160), nullable=True))

    op.create_table(
        "maille_analyse",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code_maille", sa.String(40), nullable=False),
        sa.Column("zone_id", sa.Integer(), sa.ForeignKey("zone.id"), nullable=True),
        sa.Column("cote_m", sa.Integer(), nullable=False, server_default="300"),
        sa.Column("superficie_km2", sa.Float(), nullable=False, server_default="0.233827"),
        sa.Column("population_worldpop", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("densite_hab_km2", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("dist_hydro_m", sa.Float(), nullable=True),
        sa.Column("altitude_moy_m", sa.Float(), nullable=True),
        sa.Column("indice_alea", sa.Float(), nullable=True),
        sa.Column("geom", Geometry("POLYGON", srid=4326, spatial_index=False), nullable=False),
    )
    op.create_index("ix_maille_analyse_code_maille", "maille_analyse", ["code_maille"], unique=True)
    op.create_index("ix_maille_analyse_zone_id", "maille_analyse", ["zone_id"])

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.create_index(
            "ix_maille_analyse_geom_gist",
            "maille_analyse",
            ["geom"],
            postgresql_using="gist",
        )
        op.execute("CREATE INDEX IF NOT EXISTS ix_zone_geom_gist ON zone USING gist (geom)")


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.drop_index("ix_maille_analyse_geom_gist", table_name="maille_analyse")
        op.execute("DROP INDEX IF EXISTS ix_zone_geom_gist")

    op.drop_index("ix_maille_analyse_zone_id", table_name="maille_analyse")
    op.drop_index("ix_maille_analyse_code_maille", table_name="maille_analyse")
    op.drop_table("maille_analyse")

    op.drop_column("zone", "source_geom")
    op.drop_column("zone", "densite_hab_km2")
    op.drop_column("zone", "superficie_km2")
    op.drop_column("zone", "population_totale")
    op.drop_column("zone", "code_adm")

