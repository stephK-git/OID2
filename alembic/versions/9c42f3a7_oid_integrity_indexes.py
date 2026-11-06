"""Ajout des clés étrangères et index spatiaux O.I.D."""

from alembic import op

revision = "9c42f3a7_oid_integrity"
down_revision = "440519230d52"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_foreign_key(
        "fk_signalement_incident",
        "signalement",
        "incident",
        ["incident_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_photo_evaluation",
        "photo",
        "evaluation",
        ["evaluation_id"],
        ["id"],
    )
    op.create_index(
        "ix_incident_geom_gist",
        "incident",
        ["geom"],
        postgresql_using="gist",
    )
    op.create_index(
        "ix_signalement_geom_gist",
        "signalement",
        ["geom"],
        postgresql_using="gist",
    )
    op.create_index("ix_incident_statut", "incident", ["statut"])
    op.create_index("ix_signalement_statut", "signalement", ["statut"])
    op.create_index("ix_evaluation_incident_statut", "evaluation", ["incident_id", "statut"])


def downgrade() -> None:
    op.drop_index("ix_evaluation_incident_statut", table_name="evaluation")
    op.drop_index("ix_signalement_statut", table_name="signalement")
    op.drop_index("ix_incident_statut", table_name="incident")
    op.drop_index("ix_signalement_geom_gist", table_name="signalement")
    op.drop_index("ix_incident_geom_gist", table_name="incident")
    op.drop_constraint("fk_photo_evaluation", "photo", type_="foreignkey")
    op.drop_constraint("fk_signalement_incident", "signalement", type_="foreignkey")
