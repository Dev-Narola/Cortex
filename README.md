# Cortex

Multi-tenant AI Knowledge & Agent Platform. A production-grade
backend (Python / FastAPI / Postgres / pgvector / Arq) with a
modern frontend (Next.js 15 / React 19 / Tailwind v4) in a
single monorepo.

> **You are at the monorepo root.** The backend lives in
> [`Cortex/`](./Cortex). The frontend lives in
> [`frontend/`](./frontend). The shared docs live in
> [`Docs/`](./Docs).

---

## Why a monorepo?

* **One source of truth** — the API contract (OpenAPI) is
  generated from the backend and consumed by the frontend
  via `pnpm codegen`. A backend schema change becomes a
  frontend compile error.
* **One release** — both halves ship together (`v1.0.0`).
* **One CI** — `.github/workflows/ci.yml` runs backend + frontend
  jobs in parallel; the build fails if either half breaks.
* **One developer** — the monorepo is the right shape for a
  solo build. If the team grows, splitting is one
  `git-filter-repo` away.

## Quick start

```bash
# 1. Install everything
make install

# 2. Open two terminals
make backend        # http://localhost:8000
make frontend       # http://localhost:3000

# Or, in a single shell, run both:
make dev
```

The web app expects the backend at `http://localhost:8000`. If
you change it, update `frontend/apps/web/.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:9000
```

## Layout

```
Cortex/                          ← monorepo root (this file)
├── Cortex/                      ← Python backend (FastAPI)
│   ├── src/
│   ├── tests/
│   ├── alembic/
│   ├── pyproject.toml
│   └── README.md
├── frontend/                    ← TypeScript frontend (Next.js 15)
│   ├── apps/
│   │   └── web/                 ← the Next.js app
│   ├── packages/
│   │   ├── api-client/          ← generated from the backend OpenAPI
│   │   ├── ui/                  ← shadcn primitives + tokens
│   │   └── config/              ← env validation + shared constants
│   ├── pnpm-workspace.yaml
│   └── README.md
├── Docs/                        ← shared documentation
│   ├── architecture/  adr/  performance/  scaling/
│   ├── security/  recovery/  runbooks/  testing/
│   ├── platform/  operations/  governance/  release/
│   ├── frontend/               ← frontend-specific docs
│   ├── Architecture.md
│   └── ...
├── scripts/                     ← root-level utilities
│   ├── gen-api-client.sh        ← regenerate the TS API client
│   └── ...
├── benchmarks/                  ← V9 performance regression suite
├── .github/workflows/           ← CI + release pipelines
└── Makefile                     ← the single entrypoint
```

## Useful commands

| Command | What it does |
| --- | --- |
| `make help` | Show every command in this Makefile |
| `make install` | Install both halves |
| `make dev` | Run backend + frontend in parallel |
| `make backend-test` | Run the backend pytest suite |
| `make frontend-test` | Run the frontend Vitest suite |
| `make frontend-e2e` | Run the Playwright E2E suite |
| `make frontend-codegen` | Regenerate the API client from the running backend |
| `make lint` / `make format` | Lint + format both halves |
| `make typecheck` | Type-check both halves |
| `make clean` | Remove build artifacts |

## V9 release

The monorepo is now Cortex v1.0.0. See:

* [`Docs/release/v1.0.0-notes.md`](./Docs/release/v1.0.0-notes.md) — the release notes
* [`Docs/release/v1.0.0-acceptance.md`](./Docs/release/v1.0.0-acceptance.md) — the acceptance report
* [`Docs/release/production-readiness.md`](./Docs/release/production-readiness.md) — the go/no-go gate
* [`Docs/frontend/`](./Docs/frontend/) — the frontend developer guide

## Architecture at a glance

```
Users
MCP clients
SDKs
REST / GraphQL / WS
        ↓
   ┌────────┐
   │  Web   │ (Next.js 15, React 19, App Router)
   └────────┘
        ↓
   ┌────────┐
   │  API   │ (FastAPI, hexagonal, V9 hardening)
   └────────┘
        ↓
Command / Query services
        ↓
Repositories    Read models
        ↓
PostgreSQL + pgvector · Redis · S3 · (Neo4j forward-compat)
```

See [`Docs/architecture/architecture-review.md`](./Docs/architecture/architecture-review.md)
for the per-context audit, and [`Docs/architecture/cqrs-analysis.md`](./Docs/architecture/cqrs-analysis.md)
for the read/write split rationale.
