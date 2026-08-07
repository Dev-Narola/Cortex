/**
 * Document domain types — the canonical shape of a
 * Document as returned by the backend.
 *
 * **F3 Part 2.** Mirrors the OpenAPI schemas we
 * verified against the deployed backend
 * (`GET /openapi.json`):
 *   - `DocumentResponse` — the public list row
 *   - `DocumentStatus`   — the enum
 *
 * **Source of truth.** If the backend adds a field,
 * add it here. The components downstream
 * (DocumentsTable, DocumentRow, etc.) consume
 * this type — no component should ever declare
 * its own `Document` interface.
 */

/** The backend's status enum. Mirrors the OpenAPI
 *  `DocumentStatus` schema. */
export const DOCUMENT_STATUSES = [
  "pending",
  "parsing",
  "chunking",
  "embedding",
  "indexed",
  "failed",
] as const

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number]

/** A single document row. */
export interface Document {
  id: string
  /** Filename / display title. */
  title: string
  /** MIME type — used for the row icon + the toolbar filter. */
  mime_type: string
  status: DocumentStatus
  created_at: string
}
