/**
 * DocumentDetailHost — the (app) layout's
 * single mount point for the document detail
 * drawer.
 *
 * **F4 Part 3 (Task 52).** The F3
 * `DocumentDetailDrawer` used to be mounted
 * inline on the documents page. Now the
 * drawer can be opened from any (app)
 * surface — most importantly, the chat
 * citation panel's "View full document"
 * action. We mount the drawer once at the
 * (app) layout level so it works regardless
 * of which page triggered the open.
 *
 * **Reads the global store.** The drawer
 * itself reads `useDocumentSelection` (now
 * backed by `useDocumentSelectionStore`) and
 * the per-document query. Both work the
 * same as they did on the documents page;
 * the only difference is the drawer's
 * location in the tree.
 *
 * **Layout implication.** The (app) layout
 * now wraps its children in
 * `<DocumentDetailHost/>`, which renders
 * nothing on its own. The host is a
 * single-purpose mount point.
 */

import { type ReactNode } from "react"

import { DocumentDetailDrawer } from "./detail/DocumentDetailDrawer"

export function DocumentDetailHost(): ReactNode {
  return <DocumentDetailDrawer />
}
