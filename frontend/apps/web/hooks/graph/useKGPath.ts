/**
 * useKGPath — TanStack Query for the shortest
 * path between two entities.
 *
 * **F6 Part 3.** ``GET /api/v1/graph/path?source=&target=``
 * via the typed service.
 *
 * **Why a dedicated hook.** The spec keeps the
 * "find a path" flow separate from the "explore
 * a neighbourhood" flow — they're different
 * user actions with different states. The
 * explorer uses this hook for the "connect
 * these two" affordance, not for the default
 * initial render.
 *
 * **404 is a real state.** The backend returns
 * 404 when no path exists. The hook doesn't
 * retry 404s; the consumer shows the "No path"
 * empty state.
 */

"use client"

import { useQuery, type UseQueryResult } from "@tanstack/react-query"

import { ApiError } from "@cortex/api-client"

import { getPath } from "@/services/graph/kg"
import type { KGPathResponse } from "@/types/kg"

import { kgKeys } from "./kgKeys"

export interface UseKGPathParams {
  source: string | null
  target: string | null
  maxDepth?: number
}

export type UseKGPathResult = UseQueryResult<KGPathResponse | null, Error>

export function useKGPath(
  params: UseKGPathParams,
): UseKGPathResult {
  const { source, target, maxDepth } = params
  const enabled = Boolean(source) && Boolean(target) && source !== target
  return useQuery<KGPathResponse | null, Error>({
    queryKey: kgKeys.path(source ?? "", target ?? ""),
    queryFn: ({ signal }) => {
      if (!source || !target) {
        return Promise.resolve(null)
      }
      return getPath({
        source,
        target,
        ...(maxDepth !== undefined ? { max_depth: maxDepth } : {}),
        signal,
      })
    },
    enabled,
    retry: (failureCount, error) => {
      if (error instanceof ApiError) {
        if (error.status === 404 || error.status === 403) return false
      }
      return failureCount < 2
    },
    staleTime: 60_000,
  })
}
