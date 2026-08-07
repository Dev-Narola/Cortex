/**
 * useInvalidateDocuments — single hook for "refresh
 * the documents table after a mutation".
 *
 * **F3 Part 3 (Task 25 + 28 + 29).** Every document
 * mutation (upload / delete / reprocess) calls this
 * on success. It invalidates the `["documents"]`
 * query key namespace, which covers:
 *   - the list (`["documents", params]`)
 *   - the detail (`["documents", id]`)
 * so all of them refetch in one call.
 *
 * **Why a separate hook.** Centralises the cache key
 * the three mutations depend on. A future change to
 * the query namespace (e.g. rename to
 * `["tenants", tenantId, "documents"]`) updates one
 * file, not three.
 *
 * **Usage.**
 *   const invalidate = useInvalidateDocuments()
 *   const mutation = useUploadDocument({
 *     onSuccess: () => invalidate(),
 *   })
 */

"use client"

import { useQueryClient } from "@tanstack/react-query"

export function useInvalidateDocuments(): () => Promise<void> {
  const qc = useQueryClient()
  return async () => {
    await qc.invalidateQueries({ queryKey: ["documents"] })
  }
}
