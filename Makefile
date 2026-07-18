# Trajectory — developer workflow shortcuts.
# Local (no Docker) uses the backend venv + SQLite fallback by default.

BACKEND=backend
FRONTEND=frontend
PY=$(BACKEND)/.venv/bin/python
PIP=$(BACKEND)/.venv/bin/pip

.PHONY: help
help:
	@echo "Trajectory make targets:"
	@echo "  make setup            - create venv, install backend + frontend deps"
	@echo "  make migrate          - run Alembic migrations"
	@echo "  make seed             - load fictional demo data"
	@echo "  make backend          - run FastAPI (http://localhost:8000, docs at /docs)"
	@echo "  make frontend         - run Next.js (http://localhost:3000)"
	@echo "  make test             - run backend + frontend tests"
	@echo "  make test-backend     - pytest"
	@echo "  make test-frontend    - vitest"
	@echo "  make lint             - ruff + mypy + next build typecheck"
	@echo "  make build            - frontend production build"
	@echo "  make docker-up        - full stack via docker-compose (Postgres)"
	@echo "  make docker-down      - stop the stack"

.PHONY: setup
setup:
	cd $(BACKEND) && python3 -m venv .venv && ./.venv/bin/pip install -q --upgrade pip && ./.venv/bin/pip install -q -r requirements.txt
	cd $(FRONTEND) && npm install --no-audit --no-fund

.PHONY: migrate
migrate:
	cd $(BACKEND) && ./.venv/bin/alembic upgrade head

.PHONY: seed
seed:
	cd $(BACKEND) && ./.venv/bin/python -m app.seed.seed

.PHONY: backend
backend:
	cd $(BACKEND) && ./.venv/bin/uvicorn app.main:app --reload --port 8000

.PHONY: frontend
frontend:
	cd $(FRONTEND) && npm run dev

.PHONY: test test-backend test-frontend
test: test-backend test-frontend
test-backend:
	cd $(BACKEND) && ./.venv/bin/python -m pytest -q
test-frontend:
	cd $(FRONTEND) && npm run test

.PHONY: lint
lint:
	cd $(BACKEND) && ./.venv/bin/ruff check app tests && ./.venv/bin/mypy app
	cd $(FRONTEND) && npx tsc --noEmit

.PHONY: build
build:
	cd $(FRONTEND) && npm run build

.PHONY: docker-up docker-down
docker-up:
	docker compose up --build
docker-down:
	docker compose down
