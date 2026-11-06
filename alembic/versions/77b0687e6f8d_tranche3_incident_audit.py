"""tranche3_incident_audit

Revision ID: 77b0687e6f8d
Revises: b59edd2917ed
Create Date: 2026-11-03 15:20:00.000000

"""
from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry


revision = '77b0687e6f8d'
down_revision = 'b59edd2917ed'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "incident",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("reference_publique", sa.String(64), nullable=False, unique=True),
        sa.Column("type", sa.String(40), nullable=False),
        sa.Column("geom", Geometry("POINT", srid=4326), nullable=False),
        sa.Column("zone_id", sa.Integer, sa.ForeignKey("zone.id"), nullable=True),
        sa.Column("statut", sa.String(20), nullable=False, server_default="ouvert"),
        sa.Column("niveau_fiabilite", sa.String(20), nullable=False, server_default="declare"),
        sa.Column("score_priorite", sa.Float, nullable=False, server_default="0"),
        sa.Column("danger_immediat", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("enqueteur_id", sa.Integer, sa.ForeignKey("utilisateur.id"), nullable=True),
        sa.Column("cree_le", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("maj_le", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("cloture_le", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "audit_log",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("utilisateur_id", sa.Integer, sa.ForeignKey("utilisateur.id"), nullable=True),
        sa.Column("action", sa.String(60), nullable=False),
        sa.Column("objet_type", sa.String(40), nullable=False),
        sa.Column("objet_id", sa.Integer, nullable=False),
        sa.Column("ancien_statut", sa.String(40), nullable=True),
        sa.Column("nouveau_statut", sa.String(40), nullable=True),
        sa.Column("motif", sa.Text, nullable=True),
        sa.Column("cree_le", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )


def downgrade() -> None:
    op.drop_table("audit_log")
    op.drop_table("incident")
