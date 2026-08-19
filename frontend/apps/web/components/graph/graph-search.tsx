/**
 * GraphSearch — the floating search bar.
 *
 * **F6 Part 1.** Per the spec, the search bar
 * floats top-left over the canvas, uses the
 * Slate surface, and remains visually
 * subordinate to the graph. It does not call the
 * backend in Part 1 — the input + the onQuery
 * callback are wired so Part 2 can drop in the
 * real search behaviour without changing the
 * component's surface.
 *
 * **UX contract (Part 1).**
 *   - The bar is a single-line text field with
 *     a leading search icon.
 *   - The clear button appears once the user
 *     has typed something.
 *   - Pressing Enter or clearing the field fires
 *     the ``onQuery`` callback. The parent owns
 *     the actual filtering / backend call.
 *   - The bar is keyboard-accessible: Tab focuses
 *     the input, Esc clears it, Enter submits.
 *
 * **Slate surface.** The bar uses a translucent
 * Slate background (Slate-700 at 80% alpha) with
 * a subtle ring on focus. Translucency matters
 * here because the canvas behind it needs to
 * stay visible — the bar is a control surface,
 * not a content surface.
 *
 * **The base ``Input`` already supports prefix
 * + clearable**, so the search bar is mostly a
 * styled wrapper. We don't re-implement what
 * the UI primitive already gives us.
 */

"use client"

import { type ChangeEvent, type FormEvent, type KeyboardEvent, useState } from "react"

import { Icon } from "@cortex/ui"

export interface GraphSearchProps {
  /**
   * Fires on Enter or when the user clears the
   * field. The empty string means "show me
   * everything again" (the parent resets the
   * graph to the un-filtered state).
   */
  onQuery: (query: string) => void
  /**
   * Controlled value — when provided, the
   * input is fully driven by the parent. When
   * omitted, the bar manages its own state.
   */
  value?: string
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
  // Local state for the uncontrolled case.
  // When the parent passes ``value`` the input
  // is controlled and the local state is only
  // used as a defaultValue on first render.
  const [internal, setInternal] = useState(value ?? "")

  // The displayed value is whichever the parent
  // says OR what we hold locally. Mirrors the
  // F2 form pattern.
  const current = value ?? internal

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const next = e.target.value
    if (value === undefined) setInternal(next)
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    onQuery(current)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // Esc clears the field AND fires the
    // callback with an empty string so the
    // parent can reset the graph to the
    // un-filtered state.
    if (e.key === "Escape" && current !== "") {
      e.preventDefault()
      if (value === undefined) setInternal("")
      onQuery("")
    }
  }

  function handleClear() {
    if (value === undefined) setInternal("")
    onQuery("")
  }

  return (
    // ``role="search"`` on a <form> is the
    // WCAG-recommended landmark for search;
    // wrapping it in a <search> element is
    // equivalent and avoids the lint warning.
    // The semantic name comes from
    // ``aria-label``.
    <search
      aria-label="Search the knowledge graph"
      data-testid="graph-search"
      className="pointer-events-auto w-full max-w-sm"
    >
      <form onSubmit={handleSubmit}>
        <div className="flex h-9 w-full items-center gap-2 rounded-md border border-slate-600 bg-slate-700/80 px-3 text-sm text-paper-50 shadow-sm backdrop-blur-sm focus-within:ring-2 focus-within:ring-volt-500/50">
          <Icon name="Search" size="sm" tone="muted" aria-hidden />
          <input
            type="search"
            name="graph-query"
            aria-label={label}
            placeholder={placeholder}
            value={current}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            className="h-full w-full min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-paper-50 placeholder:text-paper-200/40 outline-none focus:outline-none focus:ring-0"
          />
          {current ? (
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
      </form>
    </search>
  )
}
