/**
 * GlobalSearch — the topbar search trigger. Click or ⌘K / Ctrl+K opens the
 * Search page (or focuses its field when already there).
 */

"use client"

import { usePathname, useRouter } from "next/navigation"
import { type ReactNode, useCallback, useEffect } from "react"

import { Icon } from "@cortex/ui"

export function GlobalSearch(): ReactNode {
  const router = useRouter()
  const pathname = usePathname()

  const open = useCallback(() => {
    if (pathname === "/app/search") document.getElementById("search-q")?.focus()
    else router.push("/app/search" as never)
  }, [pathname, router])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        open()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  return (
    <button
      type="button"
      onClick={open}
      aria-keyshortcuts="Control+K Meta+K"
      className="glass inline-flex h-9 w-full min-w-0 max-w-md items-center gap-2 rounded-full px-3.5 text-left text-sm text-faint transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon name="Search" className="h-4 w-4 shrink-0" aria-hidden />
      <span className="flex-1 truncate">Search knowledge…</span>
      <kbd className="hidden items-center gap-0.5 rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] sm:inline-flex">
        ⌘K
      </kbd>
    </button>
  )
}
