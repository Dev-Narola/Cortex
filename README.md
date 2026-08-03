# Cortex

Multi-tenant AI Knowledge & Agent Platform. Backend on FastAPI, frontend
on Next.js 15 + React 19, monorepo via pnpm.

## Repo layout

```
Cortex/
├── backend/                 # the FastAPI service (V0–V9, see backend/Cortex/)
├── frontend/                # the Next.js monorepo (F0 foundation + features)
│   ├── apps/
│   │   └── web/             # the only deployable app
│   ├── packages/
│   │   ├── ui/              # shadcn primitives + OKLCH design tokens
│   │   ├── config/          # Zod env validation + endpoint registry
│   │   └── api-client/      # typed fetch runtime + OpenAPI codegen
│   ├── biome.json
│   ├── pnpm-workspace.yaml
│   ├── tsconfig.base.json
│   └── package.json
├── Docs/                    # roadmap + design + governance
├── scripts/                 # workspace-level scripts (codegen, etc.)
├── Makefile                 # top-level dev shortcuts
└── .github/workflows/       # CI + release
```

## Backend

The backend lives in `backend/Cortex/`. Full Python service with the
V0–V9 versioning documented in `backend/Cortex/Docs/architecture/`.
Runs on FastAPI + SQLAlchemy + Postgres + Redis + an S3-compatible
object store. See `backend/Cortex/README.md` for the full command set.

## Frontend

See `frontend/README.md` for the workspace-level overview and
`frontend/apps/web/README.md` for the app. Short version:

| Command | From | What it does |
|---|---|---|
| `make dev` | root | start backend + frontend together |
| `pnpm dev` | `frontend/` | Next.js dev server on `:3000` |
| `pnpm build` | `frontend/` | production build |
| `pnpm test` | `frontend/` | unit + component tests (Vitest) |
| `pnpm test:e2e` | `frontend/apps/web/` | Playwright (Chromium/Firefox/WebKit) |
| `pnpm lint` | `frontend/` | Biome workspace-wide |
| `pnpm typecheck` | `frontend/` | tsc on every workspace |
| `pnpm codegen` | `frontend/` | regenerate `@cortex/api-client` from the backend's OpenAPI |

## Environment variables

The frontend reads from `.env.local` (gitignored) at `frontend/apps/web/.env.local`.
See `frontend/apps/web/.env.example` for the full set. Required for a
local dev run:

- `NEXT_PUBLIC_API_URL` — the backend's base URL (default `http://localhost:8000`)
- `NEXT_PUBLIC_WS_URL` — WebSocket base URL (default `ws://localhost:8000`)
- `NEXT_PUBLIC_GRAPHQL_URL` — GraphQL endpoint (default `http://localhost:8000/graphql`)

Server-only (never read on the client):

- `CORTEX_SERVICE_TOKEN` — used by route handlers that hit the private API

## Development workflow

1. **First time:** `pnpm install` from the workspace root.
2. **Backend up:** see `backend/Cortex/README.md`. A live backend
   is required for codegen and most feature work; health probes
   are tolerant of it being down.
3. **Frontend up:** `pnpm dev` from `frontend/`. The app boots even
   if the backend is unreachable; the health probe surfaces that.
4. **Feature work:** `pnpm codegen` whenever the backend's OpenAPI
   changes, then `pnpm test` before pushing.

## Workspace packages

| Package | Owner | Purpose |
|---|---|---|
| `@cortex/ui` | design system | shadcn primitives, OKLCH tokens, no business logic |
| `@cortex/config` | platform | Zod-validated env, endpoint registry, React-free |
| `@cortex/api-client` | platform | fetch wrapper + 401-refresh + generated types |

Every shared package is consumed via `workspace:*` — no relative
imports across package boundaries.

## What's in F0

F0 is **infrastructure only** — no feature UI. After F0, the project
has a complete foundation (theme, providers, query, auth scaffold,
API client, error mapping, testing, accessibility, SEO, dev tools)
but no dashboard, login screen, or feature code.

The build sequence is in `Docs/Frontend-Roadmap.md`:
- **F0** — Foundation (Parts 1, 2, 3) ← we are here
- **F1** — Component library
- **F2** — Auth + onboarding
- **F3+** — Feature phases (Dashboard, Documents, Chat, etc.)

## License

Proprietary. See `LICENSE` (when added).
