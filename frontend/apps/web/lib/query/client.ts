/**
 * QueryClient factory.
 *
 * **F0 scope (Task 18).** Centralised so the same defaults apply
 * to every query in the app — no more "this query uses staleTime
 * 60s, that one uses 30s" drift between feature folders.
 *
 * Defaults match the F0 spec:
 *   - Queries:   retry 2, staleTime 5 minutes, no refetch on focus
 *   - Mutations: retry 0
 *
 * The TanStack Query devtools only mount when `NODE_ENV=development`
 * and only inside the `<QueryProvider>` tree (see `provider.tsx`).
 *
 * **Why a factory, not a singleton.** The first render needs a
 * fresh `QueryClient` per request to avoid cross-request state
 * leakage in SSR. The factory pattern (called inside a `useState`
 * in the provider) gives us that for free.
 */

import { QueryClient } from "@tanstack/react-query"

export interface CreateQueryClientOptions {
  /**
   * Override the default retry / staleTime. Used by tests to
   * make assertions deterministic. Leave undefined in production.
   */
  overrides?: {
    staleTime?: number
    gcTime?: number
    retry?: number
  }
}

export function createQueryClient(options: CreateQueryClientOptions = {}): QueryClient {
  const staleTime = options.overrides?.staleTime ?? 5 * 60 * 1000 // 5 min
  const gcTime = options.overrides?.gcTime ?? 30 * 60 * 1000 // 30 min
  const retry = options.overrides?.retry ?? 2

  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime,
        gcTime,
        retry,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: 0,
      },
    },
  })
}
