/**
 * useCreateApiKey — TanStack Query mutation for generating a new key.
 *
 * **F7 Part 2 (Tasks 13, 22).** ``POST /api/v1/api-keys`` via
 * the typed service. Returns the one-time
 * `ApiKeyCreated` (with `raw_key`) to the caller —
 * the mutation does NOT insert the raw key into
 * the persistent query cache. The list query is
 * invalidated so the panel re-fetches the new
 * row.
 *
 * **One-time secret lifecycle.** The mutation
 * itself is the only place that holds the raw
 * key (briefly, in `onMutate` / the network
 * response). The `onSuccess` hook fires the
 * list invalidation; the panel reads the raw
 * key from the mutation's resolved value via
 * `mutateAsync` and shows it in the reveal
 * modal. Nothing in this hook persists the
 * raw key.
 */
"use client"

import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query"

import { type ApiKeyCreated, type CreateApiKeyParams, createApiKey } from "@/services/api-keys"

import { apiKeyKeys } from "./apiKeyKeys"

export type UseCreateApiKeyResult = UseMutationResult<ApiKeyCreated, Error, CreateApiKeyParams>

export function useCreateApiKey(): UseCreateApiKeyResult {
  const queryClient = useQueryClient()
  return useMutation<ApiKeyCreated, Error, CreateApiKeyParams>({
    mutationFn: (params) => createApiKey(params),
    onSuccess: () => {
      // The new key is in flight on the backend;
      // the server is the source of truth for the
      // list state. The list query is the
      // canonical cache entry — invalidate it
      // once, the panel re-fetches.
      void queryClient.invalidateQueries({ queryKey: apiKeyKeys.all })
    },
  })
}
