# O.I.D — Observatoire Inondations & Dommages

PWA de **signalement, vérification, évaluation et pilotage des inondations** pour un quartier pilote d'Abidjan (données simulées, démonstration à coûts 0 $).

Spécification complète : [`O.I.D — Guide d'élaboration et cahier des charges.md`](./O.I.D%20%E2%80%94%20Guide%20d%27%C3%A9laboration%20et%20cahier%20des%20charges.md)

## Stack

| Couche | Technologie |
|---|---|
| API | Python 3.12 (3.14 accepté en local) + FastAPI |
| ORM / Geo | SQLAlchemy 2 + GeoAlchemy 2 |
| Base de données | PostgreSQL + **PostGIS** (Supabase en prod, docker-compose en dev) |
| Migrations | Alembic |
| Front | PWA — HTML/JS + Leaflet + Chart.js (montée sur `/`, Tranche 7) |
| Déploiement | Render (Web Service Docker, 0 $), health check `/health` |

## Démarrage local

```bash
# 1. Base PostGIS locale
docker compose up -d

# 2. Environnement Python
python -m venv .venv
.venv\Scripts\activate            # Windows ; source .venv/bin/activate sous Linux/macOS
pip install -r requirements.txt -r requirements-dev.txt
copy .env.example .env           # Windows ; cp .env.example .env ailleurs

# 3. Migrations
alembic upgrade head

# 4. Lancer l'API
uvicorn app.main:app --reload
# → http://localhost:8000/health  (doit répondre {"status":"ok"})
# → http://localhost:8000/docs   (Swagger)
```

## Tests

```bash
pytest
```

## Variables d'environnement

Voir [`.env.example`](./.env.example). En production (Render) : `DATABASE_URL` pointant vers Supabase (avec PostGIS activé), `JWT_SECRET` fort, `RATE_LIMIT`.

## Structure

```
app/
  main.py            # Application FastAPI, /health, montage du static PWA
  core/config.py     # Configuration (pydantic-settings, .env)
  db/                # Base SQLAlchemy 2 + session
  models/            # Modèles (Tranche 1 : utilisateurs ; Tranches 2-4 : domaine)
  schemas/           # Schemas Pydantic
  routers/           # health (pré-tranche 1), les autres arrivent par tranches
  services/          # Règles métier (statuts, doublons, score, audit)
  static/            # PWA (Tranche 7)
alembic/             # Migrations (0001 : extension PostGIS)
tests/               # Tests pytest
scripts/             # Scripts utilitaires (seed, etc.)
docs/                # Documents de cadrage (étapes 1-5)
```
