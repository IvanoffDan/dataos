# Backend — FastAPI

## Structure

```
src/izakaya_api/
  config.py          # Pydantic Settings (reads ../.env relative to backend/)
  db.py              # SQLAlchemy engine + Base
  deps.py            # FastAPI dependencies (get_db, get_current_user)
  main.py            # App factory, router registration
  bq.py              # BigQuery helpers
  models/            # SQLAlchemy ORM models
  schemas/           # Pydantic request/response schemas
  routers/           # FastAPI route modules (connectors, datasets, labels, mappings, auth)
  services/          # Business logic (auth, fivetran)
```

## Conventions

- Config reads `.env` from `../.env` (repo root), since the dev server runs from `backend/` via `make backend-dev`
- Pattern: router → service → model. Routers handle HTTP, services handle external API calls and business logic, models are pure ORM.
- Schemas: separate `*Create`, `*Update`, `*Response` models per resource. Use `from_attributes = True` on response schemas.
- All routes require auth via `Depends(get_current_user)` except login/register.
- Alembic migrations: `cd backend && uv run alembic revision --autogenerate -m "description"`. Add `server_default` for new non-nullable columns on existing tables.
- httpx for external HTTP calls (Fivetran API). Use `httpx.BasicAuth` for Fivetran.

## Running

```bash
# From repo root:
make backend-dev     # uvicorn with --reload on :8000

# Or directly:
cd backend && uv run uvicorn izakaya_api.main:app --reload --port 8000
```
