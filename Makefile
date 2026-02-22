export PATH := $(HOME)/.local/bin:$(PATH)

.PHONY: up down install migrate backend-dev frontend-dev pipeline-dev dev-up

up:
	docker compose up -d

down:
	docker compose down

install:
	cd backend && uv sync
	cd frontend && pnpm install
	cd pipeline && uv sync --extra dev

migrate:
	cd backend && uv run alembic upgrade head

backend-dev:
	cd backend && uv run uvicorn izakaya_api.main:app --reload --port 8000

frontend-dev:
	cd frontend && pnpm dev

pipeline-dev:
	set -a && . ./.env && set +a && cd pipeline && uv run dagster dev -p 3001

dev-up: up install migrate
