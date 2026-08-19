/**
 * useKGEntityRelations — TanStack Query for the
 * relationships touching one entity.
 *
 * **F6 Part 2 (Task 9).** ``GET /api/v1/graph/relationships?entity_id={id}``
 * via the typed service. The spec is explicit:
 * don't make unnecessary relation requests for
 * every entity visible in the graph — only fire
 * the request when the user has selected an
 * entity (``enabled: Boolean(id)``).
 *
 * **Failure handling (Task 19).** A failure
 * here MUST NOT throw away the entity. The
 * explorer reads the result, and the UI shows
 * "Entity loaded / Relations unavailable" +
 * Retry. The hook doesn't surface the failure
 * via a separate "relationsError" — the
 * consumer reads the result's ``isError``.
 *
 * **Retry.** Same as ``useKGEntity`` — 404 / 403
 * are real states; everything else is transient.
 */

"use client"

import { useQuery, type UseQueryResult } from "@tanstack/react-query"

import { ApiError } from "@cortex/api-client"

import { listEntityRelations } from "@/services/graph/kg"
import type { KGRelationshipListResponse } from "@/types/kg"

import { kgKeys } from "./kgKeys"

export type UseKGEntityRelationsResult = UseQueryResult<
  KGRelationshipListResponse | null,
  Error
>

export function useKGEntityRelations(
  id: string | null,
): UseKGEntityRelationsResult {
  return useQuery<KGRelationshipListResponse | null, Error>({
    queryKey: kgKeys.relations(id ?? ""),
    queryFn: ({ signal }) =>
      id
        ? listEntityRelations({ id, signal })
        : Promise.resolve(null),
    enabled: Boolean(id),
    retry: (failureCount, error) => {
      if (error instanceof ApiError) {
        if (error.status === 404 || error.status === 403) return false
      }
      return failureCount < 2
    },
    staleTime: 60_000,
  })
}
