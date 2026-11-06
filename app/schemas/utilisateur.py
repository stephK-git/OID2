"""Schemas Pydantic pour les utilisateurs et l'authentification."""

from pydantic import BaseModel, Field


class LoginIn(BaseModel):
    email: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    nom: str | None = None


class UtilisateurCreateIn(BaseModel):
    nom: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=8)
    role: str
    zone_id: int | None = None


class UtilisateurOut(BaseModel):
    id: int
    nom: str
    email: str
    role: str
    zone_id: int | None = None
    actif: bool = True

    model_config = {"from_attributes": True}
