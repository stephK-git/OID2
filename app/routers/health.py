"""Route de santé — utilisée par le health check de Render."""

from fastapi import APIRouter

router = APIRouter(tags=["sante"])


@router.get("/health")
def health_check() -> dict[str, str]:
    """Répond 200 si l'application est en vie."""
    return {"status": "ok"}
