"""Point d'entrée de l'API O.I.D."""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.core.limiter import limiter
from app.routers import analyses, auth, coordination, enquete, health, public, rapports, verification

UPLOADS_DIR = Path(__file__).resolve().parent / "static" / "uploads"


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Plateforme opérationnelle pour le signalement, le suivi et la gestion des inondations.",
    lifespan=lifespan,
)

# Configuration CORS pour le frontend React
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(Exception)
async def unexpected_error_handler(request: Request, exc: Exception):
    # Les détails techniques restent dans les logs serveur, pas dans la réponse publique.
    import logging
    logging.getLogger("oid").exception("Erreur non gérée sur %s", request.url.path, exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "Une erreur interne est survenue."})


app.include_router(health.router)
app.include_router(auth.router)
app.include_router(public.router)
app.include_router(verification.router)
app.include_router(enquete.router)
app.include_router(coordination.router)
app.include_router(rapports.router)
app.include_router(analyses.router)

# Service des uploads (photos de signalements)
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")


@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse("/docs")

