"""utilisateur.derniere_connexion

Revision ID: b2c3d4e5f6a1
Revises: a1b2c3d4e5f6
Create Date: 2026-11-05 01:00:00.000000

"""
import sqlalchemy as sa
from alembic import op

revision = 'b2c3d4e5f6a1'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("utilisateur", sa.Column("derniere_connexion", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("utilisateur", "derniere_connexion")
