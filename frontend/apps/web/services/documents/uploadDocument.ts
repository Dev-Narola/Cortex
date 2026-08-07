/**
 * Upload document — `POST /documents` (multipart).
 *
 * **F3 Part 3 (Task 24).** Wraps the authenticated
 * `ApiClient`. The api-client detects a `FormData`
 * body and skips the JSON `Content-Type` header so
 * the browser sets the multipart boundary automatically.
 *
 * **Response.** `DocumentAcceptedResponse` —
 * `{ id, status, message }`. The status is the
 * initial `pending`; the live lifecycle is driven by
 * the background ingestion job (and surfaced via the
 * WebSocket in Part 4).
 *
 * **Validation.** The backend remains the authority;
 * the form-level Zod schema (Task 23) catches the
 * same rules client-side to give the user instant
 * feedback.
 */

import { getApiClient } from "@/lib/auth/api-client"

import type { DocumentStatus } from "./types"

export interface UploadDocumentAccepted {
  id: string
  status: DocumentStatus
  message: string
}

export interface UploadDocumentParams {
  /** The file to upload. */
  file: File
  /** Optional AbortSignal to cancel the upload. */
  signal?: AbortSignal
}

export async function uploadDocument({
  file,
  signal,
}: UploadDocumentParams): Promise<UploadDocumentAccepted> {
  const client = getApiClient()
  const form = new FormData()
  form.append("file", file, file.name)
  // We cast `form` to `unknown` first because the
  // api-client's `body` parameter is typed as
  // `unknown` — the runtime detection (`instanceof
  // FormData`) is what gates the multipart path.
  return client.post<UploadDocumentAccepted>(
    "/api/v1/documents",
    form as unknown as never,
    { signal },
  )
}
