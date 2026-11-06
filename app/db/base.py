"""Base SQLAlchemy 2 pour le projet O.I.D."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Classe de base déclarative pour tous les modèles."""
