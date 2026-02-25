# Backend — FastAPI

## Structure

```
src/izakaya_api/
  main.py                    # Slim: middleware + router registration + exception handlers
  config.py                  # Pydantic Settings (reads ../.env relative to backend/)

  core/                      # Cross-cutting concerns
    database.py              # Engine, Base, SessionLocal, get_db
    exceptions.py            # DomainError hierarchy (NotFoundError, ValidationError, etc.)
    logging.py               # Structured logging setup + get_logger()
    dependencies.py          # get_current_user, get_db, get_bq_client

  domains/                   # Bounded contexts (DDD pattern)
    auth/                    # User model, schemas, service (hash/verify), router
    connectors/              # Connector CRUD + Fivetran integration
    data_sources/            # DataSource, Mapping, PipelineRun, ValidationError
    labels/                  # Label rules CRUD + auto-label AI
    releases/                # Release snapshots + comparison
    analytics/               # Dashboard + Explore query services (read-only, cross-domain)

  infra/                     # Infrastructure adapters (external services)
    bigquery/                # BQ client, table_service, analytics queries
    fivetran/                # Fivetran API client (raises domain exceptions)
    ai/                      # Anthropic client, prompts, auto-map/auto-label

  dataset_types/             # Pure domain definitions (dataset schemas)
  routers/datasets.py        # Dataset type lookup (read-only, not moved to domain)

  # Re-export shims (backward compat for Alembic, pipeline, etc.)
  db.py → core.database
  deps.py → core.dependencies
  bq.py → core.dependencies
  models/ → domains/*/models.py
  services/ → infra/*
```

Each domain follows: `router.py → service.py → repository.py` + infra adapters.

## Conventions

- Config reads `.env` from `../.env` (repo root), since the dev server runs from `backend/` via `make backend-dev`
- **Dependency flow**: Router → Service → Repository → Infra adapter. Routers never import repos or infra directly.
- **Exceptions**: Domain exceptions (`NotFoundError`, `ExternalServiceError`, etc.) in `core/exceptions.py`. Global handler in `main.py` converts to HTTP responses. No `HTTPException` in services/repos.
- **Transactions**: Repos call `flush()`, routers call `commit()`. Single transaction per request.
- Schemas: separate `*Create`, `*Update`, `*Response` models per resource. Use `from_attributes = True` on response schemas.
- All routes require auth via `Depends(get_current_user)` except login/register.
- Alembic migrations: `cd backend && uv run alembic revision --autogenerate -m "description"`. Add `server_default` for new non-nullable columns on existing tables.
- Alembic compatibility: `models/__init__.py` re-exports all ORM models from domains; `db.py` shim re-exports from `core.database`.
- httpx for external HTTP calls (Fivetran API). Use `httpx.BasicAuth` for Fivetran.

## Running

```bash
# From repo root:
make backend-dev     # uvicorn with --reload on :8000

# Or directly:
cd backend && uv run uvicorn izakaya_api.main:app --reload --port 8000
```
