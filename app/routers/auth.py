from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.limiter import limiter
from app.core.security import create_access_token, verify_password
from app.db.session import get_db
from app.models.utilisateur import Utilisateur
from app.schemas.utilisateur import LoginIn, TokenOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenOut)
@limiter.limit("10/minute")
def login(request: Request, data: LoginIn, db: Session = Depends(get_db)):
    email = data.email.strip().lower()
    user = db.scalar(select(Utilisateur).where(Utilisateur.email == email))
    if user is None or not user.actif or not verify_password(data.password, user.mot_de_passe_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Identifiants invalides")
    user.derniere_connexion = datetime.now(UTC)
    db.commit()
    return TokenOut(
        access_token=create_access_token(str(user.id), user.role),
        role=user.role,
        nom=user.nom,
    )

