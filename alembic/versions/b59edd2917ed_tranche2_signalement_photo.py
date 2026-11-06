"""tranche2_signalement_photo

Revision ID: b59edd2917ed
Revises: 762aa75c49bc
Create Date: 2026-11-03 15:18:40.000000

"""
from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry


revision = 'b59edd2917ed'
down_revision = '762aa75c49bc'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "signalement",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("reference_suivi", sa.String(64), nullable=False, unique=True),
        sa.Column("incident_id", sa.Integer, nullable=True),
        sa.Column("type", sa.String(40), nullable=False),
        sa.Column("geom", Geometry("POINT", srid=4326), nullable=False),
        sa.Column("hauteur_eau_cm", sa.Float, nullable=True),
        sa.Column("gravite", sa.String(20), nullable=False, server_default="moyenne"),
        sa.Column("danger_immediat", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("statut", sa.String(20), nullable=False, server_default="recu"),
        sa.Column("motif_rejet", sa.Text, nullable=True),
        sa.Column("verifie_par", sa.Integer, sa.ForeignKey("utilisateur.id"), nullable=True),
        sa.Column("verifie_le", sa.DateTime(timezone=True), nullable=True),
        sa.Column("empreinte_anonyme", sa.String(64), nullable=True),
        sa.Column("cree_le", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_signalement_reference_suivi", "signalement", ["reference_suivi"], unique=True)
    op.create_table(
        "photo",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("signalement_id", sa.Integer, sa.ForeignKey("signalement.id"), nullable=True),
        sa.Column("evaluation_id", sa.Integer, nullable=True),
        sa.Column("url", sa.String(500), nullable=False),
        sa.Column("cree_le", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )


def downgrade() -> None:
    op.drop_table("photo")
    op.drop_index("ix_signalement_reference_suivi", table_name="signalement")
    op.drop_table("signalement")
