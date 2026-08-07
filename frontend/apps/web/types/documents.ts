/**
 * Document domain types — re-exports the canonical
 * `Document` + `DocumentStatus` from the services
 * layer + the lib layer, so the WebSocket + hook
 * code can import from a single place.
 *
 * **F3 Part 4 (Task 34).** The intent is to keep
 * `services/documents/types.ts` (the REST contract)
 * + `lib/documents/status.ts` (the status union)
 * as the single sources of truth, and re-export
 * them here so the `types/` directory is the
 * canonical "import all document types" surface
 * per the spec's folder layout.
 *
 * **Not a duplicate.** No re-typing — the
 * definitions are imported and re-exported
 * verbatim.
 */

export type { Document, DocumentStatus } from "@/services/documents/types"
export { DOCUMENT_STATUSES, isDocumentStatus } from "@/lib/documents/status"
export type { IngestionEvent, IngestionStatusEvent } from "./websocket"
