/**
 * GraphSearch — the floating search bar.
 *
 * **F6 Part 2 (Task 12).** The bar now drives
 * a TanStack Query (``useKGSearch``) — the
 * debounce is handled by the explorer via
 * ``useDeferredValue`` (so the hook can also
 * drive the loading indicator). The bar is
 * still a controlled input + clear button;
 * the only changes from Part 1 are:
 *   - ``onQuery`` is now a real change
 *     notification (not a submit)
 *   - ``value`` is the controlled string
 *   - The empty Enter behaviour is removed
 *     (the bar now drives an always-on search)
 *
 * **UX contract (Part 2).**
 *   - Controlled input. The explorer owns the
 *     string.
 *   - Single-line text field with a leading
 *     search icon + a clear button (when the
 *     field has content).
 *   - Escape clears the field.
 *   - Submit (Enter) is intentionally a no-op
 *     — the search runs on every keystroke
 *     (debounced by the explorer's
 *     ``useDeferredValue``). The TanStack
 *     hook has a 2-char minimum + a 30s
 *     staleTime so this isn't a flood.
 *
 * **Slate surface.** The bar uses a translucent
 * Slate background (Slate-700 at 80% alpha) with
 * a subtle ring on focus. Translucency matters
 * here because the canvas behind it needs to
 * stay visible — the bar is a control surface,
 * not a content surface.
 */

"use client"

import type { ChangeEvent, KeyboardEvent } from "react"

import { Icon } from "@cortex/ui"

export interface GraphSearchProps {
  /** The current query (controlled). */
  value: string
  /** Fires on every change (debounced upstream
   *  by the explorer's ``useDeferredValue``). */
  onQuery: (query: string) => void
  /** Accessible label. Default "Search knowledge graph". */
  label?: string
  /** Placeholder text. Default "Search knowledge graph…". */
  placeholder?: string
}

export function GraphSearch({
  onQuery,
  value,
  label = "Search knowledge graph",
  placeholder = "Search knowledge graph…",
}: GraphSearchProps) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    onQuery(e.target.value)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape" && value !== "") {
      e.preventDefault()
      onQuery("")
    }
  }

  function handleClear() {
    onQuery("")
  }

  return (
    <search
      aria-label="Search the knowledge graph"
      data-testid="graph-search"
      className="pointer-events-auto w-full max-w-sm"
    >
      <div className="flex h-9 w-full items-center gap-2 rounded-md border border-slate-600 bg-slate-700/80 px-3 text-sm text-paper-50 shadow-sm backdrop-blur-sm focus-within:ring-2 focus-within:ring-volt-500/50">
        <Icon name="Search" size="sm" tone="muted" aria-hidden />
        <input
          type="search"
          name="graph-query"
          aria-label={label}
          placeholder={placeholder}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          className="h-full w-full min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-paper-50 placeholder:text-paper-200/40 outline-none focus:outline-none focus:ring-0"
        />
        {value ? (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear search"
            className="inline-flex shrink-0 items-center justify-center rounded-sm p-0.5 text-paper-200/60 transition-colors hover:bg-slate-600/50 hover:text-paper-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-volt-500"
          >
            <Icon name="X" size="xs" />
          </button>
        ) : null}
      </div>
    </search>
  )
}
