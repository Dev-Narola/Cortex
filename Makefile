# Cortex monorepo Makefile
#
# Single entrypoint for the common dev / test / build workflows.
# The backend (`Cortex/`) and the frontend (`frontend/`) are
# independent; this Makefile coordinates them.

.PHONY: help install backend frontend dev backend-test frontend-test \
        frontend-codegen frontend-e2e lint format typecheck clean

help:  ## Show this help.
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-22s\033[0m %s\n", $$1, $$2}'

install:  ## Install dependencies for both backend and frontend.
	cd Cortex && pip install -e ".[dev]"
	cd frontend && pnpm install

backend:  ## Run the backend (uvicorn auto-reload).
	cd Cortex && uvicorn src.main:app --reload --port 8000

frontend:  ## Run the frontend (Next.js dev server).
	cd frontend && pnpm dev

dev:  ## Run backend + frontend in parallel (requires `make install` first).
	@echo "Starting backend on :8000 and frontend on :3000 ..."
	@cd Cortex && (uvicorn src.main:app --reload --port 8000 &) ; \
	cd frontend && (pnpm dev &) ; \
	wait

backend-test:  ## Run the backend test suite (pytest).
	cd Cortex && pytest tests/unit tests/chaos tests/contracts tests/architecture tests/performance --no-cov

frontend-test:  ## Run the frontend unit/component tests (Vitest).
	cd frontend && pnpm test:unit

frontend-codegen:  ## Regenerate the TypeScript API client from the backend OpenAPI.
	cd frontend && pnpm codegen

frontend-e2e:  ## Run the Playwright E2E suite.
	cd frontend && pnpm test:e2e

lint:  ## Lint both backend (ruff) and frontend (biome).
	cd Cortex && ruff check src tests || true
	cd frontend && pnpm lint

format:  ## Format both backend (ruff) and frontend (biome).
	cd Cortex && ruff format src tests || true
	cd frontend && pnpm format

typecheck:  ## Type-check both projects.
	cd Cortex && mypy src || true
	cd frontend && pnpm typecheck

clean:  ## Remove build artifacts.
	cd Cortex && rm -rf .pytest_cache .mypy_cache .ruff_cache htmlcov coverage.xml .coverage
	cd frontend && pnpm clean
