/**
 * useKGEntity — TanStack Query for a single entity.
 *
 * **F6 Part 2 (Task 8).** ``GET /api/v1/graph/entities/{id}``
 * via the typed service. The hook handles
 * idle / loading / success / error transitions
 * and follows the F0–F5 retry convention
 * (transient errors only — 404 is a real state).
 *
 * **Disabled when no id.** ``enabled: Boolean(id)``
 * matches the F3 ``useDocument`` pattern.
 *
 * **Tenant isolation.** The tenant is taken from
 * the JWT inside the api-client; the frontend
 * never passes a tenant_id in the URL.
 */

"use client"

import { useQuery, type UseQueryResult } from "@tanstack/react-query"

import { ApiError } from "@cortex/api-client"

import { getEntity } from "@/services/graph/kg"
import type { KGEntity } from "@/types/kg"

import { kgKeys } from "./kgKeys"

export type UseKGEntityResult = UseQueryResult<KGEntity | null, Error>

export function useKGEntity(id: string | null): UseKGEntityResult {
  return useQuery<KGEntity | null, Error>({
    queryKey: kgKeys.entity(id ?? ""),
    queryFn: ({ signal }) => (id ? getEntity({ id, signal }) : Promise.resolve(null)),
    enabled: Boolean(id),
    retry: (failureCount, error) => {
      if (error instanceof ApiError) {
        // 404 + 403 are real authorisation / "not
        // found" states; 401 is handled by the
        // api-client's silent refresh path.
        if (error.status === 404 || error.status === 403) return false
      }
      return failureCount < 2
    },
    staleTime: 60_000,
  })
}
