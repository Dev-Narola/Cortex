/**
 * useKGSearch — TanStack Query for the free-text
 * graph search.
 *
 * **F6 Part 2 (Task 10–12).** ``GET /api/v1/graph/search?query=...``
 * via the typed service.
 *
 * **Debouncing.** Done at the call site (the
 * search bar's ``onChange``); the hook just
 * exposes the standard ``useQuery`` contract.
 * The hook itself does NOT debounce — the
 * consumer drives the debounce so it can also
 * drive the loading indicator + the empty /
 * error states.
 *
 * **Disabled for short queries.** The backend
 * 422s on empty / whitespace-only queries;
 * the hook refuses to fire below 2 characters.
 * Two characters is the smallest search a user
 * can realistically type that's likely to match
 * anything (``Al`` already excludes most of
 * the noise).
 *
 * **No tenant param.** The tenant is taken from
 * the JWT inside the api-client (Task 17).
 */

"use client"

import { useQuery, type UseQueryResult } from "@tanstack/react-query"

import { ApiError } from "@cortex/api-client"

import { searchGraph } from "@/services/graph/kg"
import type { KGSearchResponse } from "@/types/kg"

import { kgKeys } from "./kgKeys"

export interface UseKGSearchParams {
  /** The search term. The hook fires when
   *  ``query`` is at least 2 non-whitespace
   *  characters. */
  query: string
  /** Optional type filter (the entity_type
   *  string from the backend). */
  type?: string
  /** Caller-driven debounce. Pass the
   *  debounced string; the hook will refetch
   *  when it changes. */
  enabled?: boolean
}

export type UseKGSearchResult = UseQueryResult<KGSearchResponse | null, Error>

export function useKGSearch(
  params: UseKGSearchParams,
): UseKGSearchResult {
  const { query, type, enabled = true } = params
  const trimmed = query.trim()
  const isLongEnough = trimmed.length >= 2
  return useQuery<KGSearchResponse | null, Error>({
    queryKey: kgKeys.search(`${trimmed}::${type ?? ""}`),
    queryFn: ({ signal }) =>
      searchGraph({ query: trimmed, ...(type ? { type } : {}), signal }),
    enabled: enabled && isLongEnough,
    retry: (failureCount, error) => {
      if (error instanceof ApiError) {
        if (error.status === 404 || error.status === 403) return false
      }
      return failureCount < 2
    },
    // Search results are user-input-driven; keep
    // them warm for 30s so a quick re-type doesn't
    // hit the network again.
    staleTime: 30_000,
    // The same query typed twice should hit the
    // same network call as long as the cache is
    // warm.
    gcTime: 5 * 60_000,
  })
}
