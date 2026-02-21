# Izakaya

PoC data ingestion platform. Users configure Fivetran connectors to ingest data into BigQuery, define datasets, map columns, and create labelling rules.

## Architecture

Monorepo with three services (each has its own `CLAUDE.md` with service-specific details):

- **frontend/** — Next.js 15 (App Router, TypeScript, Tailwind, pnpm)
- **backend/** — Python 3.12 / FastAPI / SQLAlchemy 2.0 / Alembic
- **pipeline/** — Dagster with dagster-fivetran

Infrastructure: PostgreSQL 15 (app DB), BigQuery (data warehouse), Fivetran (ingestion).

## Domain Model

- **Connector** — Fivetran connector config (links to Fivetran connector ID, tracks sync status). Created via Fivetran Connect Card (popup flow).
- **Dataset** — User-defined logical dataset (e.g. "sales", "paid media") with a target schema
- **Mapping** — Maps source columns (from Fivetran/BQ tables) to dataset columns
- **Label Rule** — Value replacement rule for a dataset column (e.g. geography="sydney" → "NSW")

## Commands

```bash
make up              # Start Postgres via docker compose
make down            # Stop Postgres
make install         # Install all deps (backend + frontend + pipeline)
make migrate         # Run Alembic migrations
make backend-dev     # Start FastAPI dev server on :8000
make frontend-dev    # Start Next.js dev server on :3000
make pipeline-dev    # Start Dagster dev server on :3001
make dev-up          # up + install + migrate (full local setup)
```

## Conventions

- Backend uses `src/` layout (`src/izakaya_api/`)
- Pipeline uses `src/` layout (`src/izakaya_pipeline/`)
- Python formatting: ruff
- Frontend formatting: default Next.js / ESLint config
- Database migrations via Alembic (auto-generate with `cd backend && uv run alembic revision --autogenerate -m "description"`)
- Environment variables in `.env` at repo root (copy from `.env.example`)
- Postgres runs on port 55432 locally to avoid conflicts
- API proxy: Next.js rewrites `/api/*` to `http://localhost:8000/*`
- Auth: PoC-grade cookie-based sessions (not production-ready)
- `uv` is at `~/.local/bin/uv` — use `export PATH="$HOME/.local/bin:$PATH"` or the Makefile (which sets this)

## Fivetran Integration

- Connect Card opens in a **popup window** (not iframe — Fivetran blocks embedding via X-Frame-Options)
- Connector creation flow: backend creates connection via `POST /v1/connections` with `connect_card_config`, then frontend opens the returned `connect_card.uri` in a popup for user authorization
- The `POST /v1/connections` request requires `config.schema` (unique, used as BQ schema name) and `config.table` — some connector types also need `table`; set both to be safe
- Schema names must be globally unique per Fivetran destination — append a UUID suffix
- `run_setup_tests: false` is required when using Connect Card (no credentials at creation time)
- After setup completes, explicitly call `POST /v1/connections/{id}/sync` with `force: true` to trigger immediate sync
- Deleting a connector should also delete it from Fivetran via `DELETE /v1/connections/{id}`
- API auth: Basic Auth with `FIVETRAN_API_KEY:FIVETRAN_API_SECRET`
