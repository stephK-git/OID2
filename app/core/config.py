"""Configuration de l'application O.I.D (variables d'environnement)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Réglages chargés depuis l'environnement / `.env`."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "O.I.D — Observatoire Inondations & Dommages"
    debug: bool = False

    # Base de données (PostgreSQL + PostGIS)
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/oid"

    # Sécurité (Tranche 1 : authentification JWT)
    jwt_secret: str = "change-me-in-production"  # À remplacer impérativement en production
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24

    # Limite de débit (slowapi)
    rate_limit: str = "5/minute"

    # API PWA
    base_url: str = "http://localhost:8000"


settings = Settings()
