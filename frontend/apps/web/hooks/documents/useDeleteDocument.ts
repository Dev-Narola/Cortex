/**
 * useDeleteDocument — TanStack Mutation for deletion.
 *
 * **F3 Part 3 (Task 28).** Invalidates the
 * `["documents"]` query on success so the table
 * drops the deleted row. The detail drawer (if open)
 * is closed by the caller once the mutation resolves.
 *
 * **No optimistic delete.** Deletion is irreversible
 * on the backend; we wait for the 2xx before updating
 * the table.
 */

"use client"

import { useMutation, type UseMutationResult } from "@tanstack/react-query"

import {
  deleteDocument,
  type DeleteDocumentParams,
} from "@/services/documents"

export type UseDeleteDocumentResult = UseMutationResult<
  void,
  Error,
  DeleteDocumentParams
>

export function useDeleteDocument(): UseDeleteDocumentResult {
  return useMutation<void, Error, DeleteDocumentParams>({
    mutationFn: (params) => deleteDocument(params),
  })
}
