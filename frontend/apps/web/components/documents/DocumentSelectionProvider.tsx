/**
 * DocumentSelectionProvider — F3 Part 2
 * (Task 20) + Part 3 shim.
 *
 * **Backward compatibility.** The F3
 * `useDocumentSelection()` hook API is
 * preserved. The implementation is now a
 * thin wrapper around the module-level
 * `useDocumentSelectionStore` (a Zustand
 * store) so the citation panel on the
 * /chat pages can drive the same drawer
 * via the imperative
 * `documentSelectionStore.openDetail(id)`
 * handle without needing this provider in
 * its tree.
 *
 * **The provider itself is a no-op**
 * (returns `children`) — it exists only
 * so the documents page's JSX stays
 * familiar to readers. The state is
 * module-level; no provider context is
 * actually needed.
 *
 * **Migration path.** Future code should
 * use `useDocumentSelectionStore` or
 * `documentSelectionStore` directly. The
 * `useDocumentSelection` hook remains the
 * recommended way to consume the state
 * from React (it still re-renders on
 * selection changes), but the call goes
 * through the Zustand selector, not
 * through React context.
 *
 * **Memoisation.** The hook's return value
 * is memoised with a structural-equality
 * shallow check so consumers that depend
 * on the object identity (e.g. the
 * `DocumentDetailDrawer`'s `useEffect`
 * on `selectedId`) don't re-render on
 * every state change.
 */

"use client"

import { useMemo, type ReactNode } from "react"

import { useDocumentSelectionStore } from "./DocumentSelectionStore"

interface DocumentSelectionContextValue {
  selectedId: string | null
  isOpen: boolean
  select: (id: string) => void
  clear: () => void
  openDetail: (id: string) => void
  closeDetail: () => void
}

export function DocumentSelectionProvider({
  children,
}: {
  children: ReactNode
}) {
  return <>{children}</>
}

export function useDocumentSelection(): DocumentSelectionContextValue {
  const selectedId = useDocumentSelectionStore((s) => s.selectedId)
  const isOpen = useDocumentSelectionStore((s) => s.isOpen)
  const select = useDocumentSelectionStore((s) => s.select)
  const clear = useDocumentSelectionStore((s) => s.clear)
  const openDetail = useDocumentSelectionStore((s) => s.openDetail)
  const closeDetail = useDocumentSelectionStore((s) => s.closeDetail)
  return useMemo(
    () => ({ selectedId, isOpen, select, clear, openDetail, closeDetail }),
    [selectedId, isOpen, select, clear, openDetail, closeDetail],
  )
}
