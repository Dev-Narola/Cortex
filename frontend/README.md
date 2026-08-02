# Cortex Frontend

Cortex is a multi-tenant AI Knowledge & Agent Platform. This
directory hosts the **frontend monorepo** that consumes the
Cortex backend API.

## Stack

* **Next.js 15** (App Router) + **React 19** + **TypeScript 5.6**
* **Tailwind CSS v4** + **shadcn/ui** (Radix primitives)
* **TanStack Query** for REST, **urql + graphcache** for GraphQL
* **Zustand** for global UI state
* **openapi-typescript** to generate the API client from the
  backend's OpenAPI spec (single source of truth)
* **native WebSocket** for streaming chat and ingestion status
* **react-force-graph-3d** for the knowledge-graph explorer
* **GSAP** (marketing) + **Framer Motion** (in-app) for animation
* **Playwright** (E2E) + **Vitest** (unit/component)

## Layout

```
frontend/
├── apps/
│   └── web/             # the Next.js application
├── packages/
│   ├── api-client/      # generated from the backend OpenAPI spec
│   ├── ui/              # shadcn primitives + design tokens
│   ├── config/          # env validation + shared constants
│   └── eslint-config/   # shared lint / TS configs
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── package.json
```

## Quick start

```bash
# from the repo root
cd frontend

# install dependencies (pnpm 10+)
pnpm install

# generate the API client from the running backend
pnpm codegen

# run the web app (defaults to http://localhost:3000)
pnpm dev
```

The web app expects the backend at `http://localhost:8000` by
default — override with `NEXT_PUBLIC_API_URL` in `.env.local`.

## Useful commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run the web app in dev mode |
| `pnpm build` | Production build (all packages) |
| `pnpm test` | Run all unit/component tests |
| `pnpm test:unit` | Unit tests for the web app only |
| `pnpm test:e2e` | Playwright E2E tests |
| `pnpm lint` | Lint (Biome) |
| `pnpm format` | Auto-format (Biome) |
| `pnpm typecheck` | TypeScript checks across the workspace |
| `pnpm codegen` | Regenerate `@cortex/api-client` from the backend |
| `pnpm clean` | Remove build / cache artifacts |

## Design system

The `@cortex/ui` package owns the design tokens (OKLCH color
tables, type scale, motion) and the unstyled Radix primitives.
The web app composes them — see `apps/web/components/` for
the app-specific components.

## Real-time

Native WebSocket via a custom `useSocket` hook (see
`apps/web/lib/socket/`). Reconnection is exponential-backoff +
silent-resume; the surface is documented in
`Docs/frontend/real-time.md`.

## Auth

JWT access token in memory (Zustand store, never
localStorage). Refresh token in an httpOnly cookie set by the
backend. The Next.js middleware gates the `(app)` route group
server-side before any client bundle byte ships.

## Documentation

* [Design system](../Docs/frontend/design-system.md)
* [Routing](../Docs/frontend/routing.md)
* [State management](../Docs/frontend/state-management.md)
* [Real-time](../Docs/frontend/real-time.md)
* [Accessibility](../Docs/frontend/accessibility.md)
