/**
 * Deprecated stub — replaced by
 * `components/documents/upload/UploadDocumentModal`.
 *
 * This file used to host a single-tab "pick a file"
 * modal that did nothing. F3 Part 3 moves the real
 * upload surface to the new location, with a two-tab
 * (File / URL) layout, real validation, and the live
 * `useUploadDocument` mutation.
 *
 * The old name is kept here as a thin re-export so
 * any stale import resolves cleanly. The new
 * component is the canonical entry point.
 */

export { UploadDocumentModal as DocumentUploadModal } from "./upload/UploadDocumentModal"
