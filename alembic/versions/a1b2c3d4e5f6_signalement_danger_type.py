"""danger_type sur signalement (page de signalement).

Revision ID: a1b2c3d4e5f6
Revises: 9c42f3a7_oid_integrity
Create Date: 2026-11-05 00:00:00.000000

"""
import sqlalchemy as sa
from alembic import op

revision = 'a1b2c3d4e5f6'
down_revision = '9c42f3a7_oid_integrity'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("signalement", sa.Column("danger_type", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("signalement", "danger_type")
