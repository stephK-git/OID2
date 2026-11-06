"""tranche1_utilisateur_zone

Revision ID: 762aa75c49bc
Revises: 0001_initial_postgis
Create Date: 2026-11-03 15:17:38.255619

"""
from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry


revision = '762aa75c49bc'
down_revision = '0001_initial_postgis'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "zone",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("nom", sa.String(120), nullable=False),
        sa.Column("geom", Geometry("MULTIPOLYGON", srid=4326), nullable=True),
    )
    op.create_table(
        "utilisateur",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("nom", sa.String(120), nullable=False),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("mot_de_passe_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(30), nullable=False),
        sa.Column("zone_id", sa.Integer, sa.ForeignKey("zone.id"), nullable=True),
        sa.Column("actif", sa.Boolean, nullable=False, server_default=sa.text("true")),
    )
    op.create_index("ix_utilisateur_email", "utilisateur", ["email"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_utilisateur_email", table_name="utilisateur")
    op.drop_table("utilisateur")
    op.drop_table("zone")
