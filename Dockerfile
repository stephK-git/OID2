# O.I.D — Observatoire Inondations & Dommages
# API FastAPI + PostGIS (PostgreSQL) — démonstration, déploiement Render (0 $).

FROM python:3.12-slim

# Outils système pour psycopg[binary] et la compilation de dépendances si besoin.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Rendu des migrations optionnel via : docker run --rm <image> alembic upgrade head
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
