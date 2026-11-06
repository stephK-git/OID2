"""Schemas Pydantic pour les incidents."""

from datetime import datetime

from pydantic import BaseModel, Field


class IncidentBase(BaseModel):
    type: str
    statut: str = "ouvert"
    niveau_fiabilite: str = "declare"
    score_priorite: float = 0.0
    danger_immediat: bool = False


class IncidentAffecterIn(BaseModel):
    enqueteur_id: int


class IncidentRouvrirIn(BaseModel):
    motif: str = Field(min_length=1)


class IncidentOut(IncidentBase):
    id: int
    reference_publique: str
    enqueteur_id: int | None = None
    cree_le: datetime | None = None
    maj_le: datetime | None = None
    cloture_le: datetime | None = None

    model_config = {"from_attributes": True}
