"""Schemas Pydantic centralisés — signalement."""

from typing import Literal

from pydantic import BaseModel, Field


class SignalementIn(BaseModel):
    type: Literal["rue", "habitation", "route", "cours_eau", "infrastructure", "autre"]
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    hauteur_eau_cm: float | None = Field(default=None, ge=0, le=10000)
    gravite: Literal["faible", "moyenne", "elevee"] = "moyenne"
    danger_immediat: bool = False
    danger_type: Literal["trapped", "electric", "effondrement", "autre"] | None = None
    description: str | None = Field(default=None, max_length=1000)
    photo_data_url: str | None = Field(default=None, max_length=14_000_000)


class SignalementOut(BaseModel):
    reference_suivi: str
    statut: str
    incident_id: int | None = None
    type: str | None = None
    gravite: str | None = None
    danger_immediat: bool = False
    danger_type: str | None = None
    cree_le: str | None = None
    incident_statut: str | None = None
    incident_reference: str | None = None
    niveau_fiabilite: str | None = None
    motif_rejet: str | None = None

