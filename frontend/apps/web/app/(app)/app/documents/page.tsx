/**
 * Documents list — `/app/documents`.
 *
 * **F3 Part 2 (Task 11).** Composes the documents
 * module: `DocumentSelectionProvider` →
 * `useDocuments()` → toolbar + table / error / empty.
 *
 * **Server entry.** The page is a thin server component
 * that mounts the client `DocumentsView`. Splitting
 * prevents the build from trying to pre-render the
 * TanStack Query / useAuthStore calls.
 *
 * **No business logic.** Every action delegates to
 * the reusable components in `components/documents/`.
 */

import { DocumentsView } from "./DocumentsView"

export default function DocumentsPage() {
  return <DocumentsView />
}
