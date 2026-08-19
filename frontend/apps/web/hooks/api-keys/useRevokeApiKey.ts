/**
 * useRevokeApiKey — TanStack Query mutation for revoking a key.
 *
 * **F7 Part 2 (Task 25).** ``DELETE /api/v1/api-keys/{id}`` via
 * the typed service. The mutation invalidates the
 * list query on success so the panel re-fetches
 * the updated row (with `revoked_at` set).
 *
 * **The optimistic update question.** We could
 * optimistically flip the row's `revoked_at` in
 * the cache for instant UX; the cost is the
 * rollback path on failure. Part 2 keeps the
 * simple "invalidate on success" path; a future
 * hardening pass can add the optimistic update
 * + rollback if the UX feels slow.
 */
"use client"

import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query"

import { type ApiKey, type RevokeApiKeyParams, revokeApiKey } from "@/services/api-keys"

import { apiKeyKeys } from "./apiKeyKeys"

export type UseRevokeApiKeyResult = UseMutationResult<ApiKey, Error, RevokeApiKeyParams>

export function useRevokeApiKey(): UseRevokeApiKeyResult {
  const queryClient = useQueryClient()
  return useMutation<ApiKey, Error, RevokeApiKeyParams>({
    mutationFn: (params) => revokeApiKey(params),
    onSuccess: () => {
      // The list (Active view + the future
      // "include revoked" view) re-fetches.
      void queryClient.invalidateQueries({ queryKey: apiKeyKeys.all })
    },
  })
}
