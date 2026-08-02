# `@cortex/api-client`

Typed REST client for the Cortex backend. Hand-written runtime +
generated types from the backend's OpenAPI schema.

## What lives here

- `src/runtime.ts` — the `ApiClient` class. Handles auth headers, 401
  silent refresh, retry, and error mapping. The runtime is hand-written
  because auth/refresh behavior is app-wide and stable.
- `src/types.ts` — generated from the backend's `/openapi.json` by
  the codegen script. **Do not edit by hand** — run `pnpm codegen`
  to regenerate after backend changes.
- `src/index.ts` — public re-exports.
- `scripts/generate.ts` — the codegen script. Fetches
  `${publicEnv.NEXT_PUBLIC_API_URL}/openapi.json`, runs it through
  `openapi-typescript`, writes `src/types.ts`.

## What does NOT live here

- UI or React.
- Env vars (`@cortex/config` owns those; the codegen reads them).
- Per-endpoint method helpers (those are generated alongside types).

## Consumption

```ts
import { ApiClient, ApiError } from "@cortex/api-client";

const client = new ApiClient({ baseUrl: publicEnv.NEXT_PUBLIC_API_URL });
const data = await client.post<TokenResponse>("/api/v1/auth/login", body);
```

## Regenerating types

```bash
# from the workspace root
pnpm codegen
```

Requires the backend to be reachable at `NEXT_PUBLIC_API_URL`.
