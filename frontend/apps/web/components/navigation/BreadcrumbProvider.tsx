/**
 * BreadcrumbProvider — context for per-page breadcrumb
 * overrides.
 *
 * **F3 Part 1 (Task 6).** The Topbar auto-generates a
 * breadcrumb trail from the current pathname. Most of
 * the time that's exactly right ("Dashboard → Documents"
 * for `/app/documents`). Sometimes a page wants to
 * inject a custom leaf (e.g. "Document Details" for a
 * dynamic `documents/[id]` route) or replace the whole
 * trail. This provider is the API for that.
 *
 * **Usage.** Inside a page or layout:
 *
 *   useEffect(() => {
 *     setBreadcrumb({
 *       items: [
 *         { label: "Dashboard", href: "/app/dashboard" },
 *         { label: "Documents", href: "/app/documents" },
 *         { label: documentTitle }, // leaf — no href
 *       ],
 *     })
 *     return () => clearBreadcrumb()
 *   }, [documentTitle])
 *
 * **Reset on unmount.** The hook above is the canonical
 * pattern; if a page forgets the cleanup the next
 * navigation will clear the override (the `usePathname`
 * subscription in the Topbar re-evaluates after every
 * navigation, and the context value is treated as a
 * "sticky override" that pages opt in + out of).
 *
 * **Single-page consumers only.** The provider lives at
 * the (app) layout level; a page's override applies
 * globally until cleared. The single-renter pattern is
 * fine for the app shell — only one page is active at
 * a time.
 */

"use client"

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"

import type { BreadcrumbItem } from "@cortex/ui"

export interface BreadcrumbOverride {
  items: BreadcrumbItem[]
}

interface BreadcrumbContextValue {
  /** The current override (if any). `null` = no override. */
  override: BreadcrumbOverride | null
  /** Replace the current override. */
  setBreadcrumb: (next: BreadcrumbOverride) => void
  /** Clear the current override; the auto-generator takes over. */
  clearBreadcrumb: () => void
}

const BreadcrumbContext = createContext<BreadcrumbContextValue | undefined>(undefined)

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<BreadcrumbOverride | null>(null)
  const setBreadcrumb = useCallback((next: BreadcrumbOverride) => {
    setOverride(next)
  }, [])
  const clearBreadcrumb = useCallback(() => {
    setOverride(null)
  }, [])
  const value = useMemo(
    () => ({ override, setBreadcrumb, clearBreadcrumb }),
    [override, setBreadcrumb, clearBreadcrumb],
  )
  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>
}

export function useBreadcrumbContext(): BreadcrumbContextValue {
  const ctx = useContext(BreadcrumbContext)
  if (!ctx) {
    throw new Error("useBreadcrumbContext must be used inside <BreadcrumbProvider>")
  }
  return ctx
}

/**
 * Hook for pages to read the current breadcrumb items
 * (auto-generated + override applied) and to register an
 * override.
 */
export function useBreadcrumb(): BreadcrumbOverride | null {
  return useBreadcrumbContext().override
}
