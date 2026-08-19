/**
 * useKGEntityNeighbors — TanStack Query for the
 * adjacent entities.
 *
 * **F6 Part 2 (Task 9 + Part 3 traversal).**
 * ``GET /api/v1/graph/entities/{id}/neighbors``
 * via the typed service. Like the relations
 * hook, this only fires when an entity is
 * selected (``enabled: Boolean(id)``).
 *
 * **Used in two flows.**
 *   1. The initial graph for a selected entity
 *      (Part 2 — the explorer combines this
 *      with the relations hook to render a
 *      full subgraph).
 *   2. The Part 3 "explore outward" action
 *      (the same hook + the same cache, just a
 *      different consumer driving the cache).
 *
 * **Direction.** The backend accepts
 * ``direction=outgoing|incoming|both``; we
 * default to ``both`` (the spec's Part 2 graph
 * is undirected visually; the backend's
 * direction filter is mostly an optimisation
 * for the next part).
 */

"use client"

import { useQuery, type UseQueryResult } from "@tanstack/react-query"

import { ApiError } from "@cortex/api-client"

import { listEntityNeighbors } from "@/services/graph/kg"
import type { KGNeighborResponse } from "@/types/kg"

import { kgKeys } from "./kgKeys"

export interface UseKGEntityNeighborsParams {
  /** When false, the query is paused. Default
   *  true. Used by the explorer to avoid
   *  refetching neighbours when the user
   *  hasn't picked an entity yet. */
  enabled?: boolean
}

export type UseKGEntityNeighborsResult = UseQueryResult<
  KGNeighborResponse | null,
  Error
>

export function useKGEntityNeighbors(
  id: string | null,
  params: UseKGEntityNeighborsParams = {},
): UseKGEntityNeighborsResult {
  const { enabled = true } = params
  return useQuery<KGNeighborResponse | null, Error>({
    queryKey: kgKeys.neighbors(id ?? ""),
    queryFn: ({ signal }) =>
      id
        ? listEntityNeighbors({ id, signal, direction: "both" })
        : Promise.resolve(null),
    enabled: Boolean(id) && enabled,
    retry: (failureCount, error) => {
      if (error instanceof ApiError) {
        if (error.status === 404 || error.status === 403) return false
      }
      return failureCount < 2
    },
    staleTime: 60_000,
  })
}
