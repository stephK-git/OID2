"""tranche4_evaluation

Revision ID: 440519230d52
Revises: 77b0687e6f8d
Create Date: 2026-11-03 15:22:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '440519230d52'
down_revision = '77b0687e6f8d'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "evaluation",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("incident_id", sa.Integer, sa.ForeignKey("incident.id"), nullable=False),
        sa.Column("enqueteur_id", sa.Integer, sa.ForeignKey("utilisateur.id"), nullable=False),
        sa.Column("menages_touches", sa.Integer, nullable=False, server_default="0"),
        sa.Column("personnes_affectees", sa.Integer, nullable=False, server_default="0"),
        sa.Column("blesses", sa.Integer, nullable=False, server_default="0"),
        sa.Column("deplaces", sa.Integer, nullable=False, server_default="0"),
        sa.Column("deces", sa.Integer, nullable=False, server_default="0"),
        sa.Column("disparus", sa.Integer, nullable=False, server_default="0"),
        sa.Column("degats", sa.Text, nullable=True),
        sa.Column("routes_coupees", sa.Text, nullable=True),
        sa.Column("risques_sanitaires", sa.Text, nullable=True),
        sa.Column("besoins", sa.Text, nullable=True),
        sa.Column("recommandations", sa.Text, nullable=True),
        sa.Column("statut", sa.String(20), nullable=False, server_default="brouillon"),
        sa.Column("soumise_le", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("evaluation")
