"""Configuration de l'application O.I.D (variables d'environnement)."""

from pydantic import field_validator
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

    # API PWA & CORS (origines séparées par des virgules en prod, ex: https://oid.vercel.app)
    base_url: str = "http://localhost:8000"
    cors_origins: str = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173"

    # Stockage objet Supabase Storage (optionnel en local ; recommandé en production)
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_storage_bucket: str = "oid-photos"

    @field_validator("database_url", mode="before")
    @classmethod
    def _normalize_postgres_driver(cls, value: str) -> str:
        """Convertit les URLs Supabase/Heroku `postgres://` ou `postgresql://` vers le pilote `psycopg`."""
        if isinstance(value, str):
            if value.startswith("postgres://"):
                return "postgresql+psycopg://" + value[len("postgres://") :]
            if value.startswith("postgresql://"):
                return "postgresql+psycopg://" + value[len("postgresql://") :]
        return value

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip().rstrip("/") for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def supabase_storage_enabled(self) -> bool:
        return bool(self.supabase_url.strip() and self.supabase_service_role_key.strip())


settings = Settings()
