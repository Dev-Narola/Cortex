/**
 * GlobalSearch — the search input in the topbar.
 *
 * **F3 Part 1 (Task 9).** Read-only placeholder. The
 * real search lands in F4 — for now the input is a
 * no-op button that surfaces a toast saying
 * "Search coming in F4" when clicked (or activated
 * via the keyboard).
 *
 * **Keyboard shortcut.** The spec asks us to "reserve"
 * `Ctrl/Cmd + K` for the future. We listen for it
 * globally and trigger the same "coming in F4" toast
 * so the affordance is consistent with the click path.
 * The real F4 search will own the shortcut (it
 * already does, in a sense — the listener will be
 * replaced with the F4 CommandPalette).
 *
 * **No business logic.** The input is non-functional;
 * the value is never read. `onClick` and the keyboard
 * listener are the only behaviours.
 *
 * **Why a button, not an `<input>`.** Using a
 * button-as-input keeps the placeholder visually
 * consistent with what the real search will look
 * like (a CommandPalette modal), and it makes the
 * "this isn't a real input" affordance explicit for
 * screen readers (`aria-disabled` + tooltip).
 */

"use client"

import { useEffect, type ReactNode } from "react"

import { Icon, toast } from "@cortex/ui"

function showComingSoonToast() {
  toast({
    title: "Search coming in F4",
    description: "We're wiring up the global search soon — for now, head to Documents to find what you uploaded.",
  })
}

export function GlobalSearch(): ReactNode {
  // Reserve Ctrl/Cmd + K for the future. When the user
  // hits the shortcut we show the same toast as a
  // click so the affordance is consistent.
  useEffect(() => {
    if (typeof window === "undefined") return
    function onKey(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey
      if (isMod && (e.key === "k" || e.key === "K")) {
        e.preventDefault()
        showComingSoonToast()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <button
      type="button"
      onClick={showComingSoonToast}
      aria-label="Search (coming in F4)"
      aria-disabled
      className="group inline-flex h-9 w-full min-w-0 max-w-md items-center gap-2 rounded-md border border-border bg-muted/30 px-3 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Icon name="Search" className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">Search Cortex…</span>
      <kbd className="hidden items-center gap-0.5 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground sm:inline-flex">
        <span className="text-[10px]">⌘</span>K
      </kbd>
    </button>
  )
}
