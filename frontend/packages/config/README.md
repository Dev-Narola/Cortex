# `@cortex/config`

Reusable environment + endpoint configuration shared across every
Cortex frontend app. React-free, safe to import from server or client.

## What lives here

- `src/env.ts` — Zod-validated public + server env schemas. The
  `publicEnv` object is safe to read in the browser.
- `src/api.ts` — typed endpoint registry. Single source of truth for
  every path the client calls, so a refactor can't quietly break
  callers.
- `src/index.ts` — public re-exports.

## What does NOT live here

- React, hooks, stores, providers.
- Network code (`@cortex/api-client` owns that).
- UI tokens (`@cortex/ui` owns those).

## Consumption

```ts
import { publicEnv, apiConfig } from "@cortex/config";
```

Adding a new env var? Add the Zod entry to `env.ts` first. Adding a
new endpoint? Add it to `api.ts` first. Both must exist before the
caller can use them — that's the point.
