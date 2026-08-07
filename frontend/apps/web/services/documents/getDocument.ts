/**
 * Documents service — single document.
 *
 * **F3 Part 2 (Task 12).** Wraps `GET /documents/{id}`.
 * Used when a row is clicked (DocumentSelectionProvider
 * triggers `useDocument(id)` which calls this).
 *
 * **No state.** Returns the parsed `Document`.
 */

import { getApiClient } from "@/lib/auth/api-client"

import type { Document } from "./types"

export async function getDocument(id: string): Promise<Document> {
  const client = getApiClient()
  return client.get<Document>(`/api/v1/documents/${encodeURIComponent(id)}`)
}
