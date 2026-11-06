"""Révision initiale : activation de l'extension PostGIS."""

from alembic import op

revision = "0001_initial_postgis"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PostGIS est requis par les colonnes géométriques futures (localisations,
    # polygones de quartiers, trajets). À activer dans la base de production
    # (Supabase) ou localement (docker-compose) avant les autres migrations.
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis;")


def downgrade() -> None:
    # On ne supprime pas l'extension en régression : elle est partagée
    # et peut être utilisée par d'autres schémas de la base.
    op.execute("SELECT 1;")
