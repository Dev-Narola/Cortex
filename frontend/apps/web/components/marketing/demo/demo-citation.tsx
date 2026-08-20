/**
 * DemoCitation — the inline citation marker
 * inside the streamed answer.
 *
 * **F8 Part 4.** The marketing demo's
 * "this is the actual product" beat. The
 * chip is a real `<button>` (per the F4
 * chat convention — not a `<span
 * onClick>`), it carries a real
 * `aria-label`, and clicking it dispatches
 * the `onOpen` callback so the parent
 * `DemoChat` can show the source panel.
 *
 * **Visual.** A subtle rounded pill —
 * small superscript-style. Same ember-tinted
 * treatment as the F4 `CitationChip` so
 * the marketing demo's visual grammar
 * matches the real product.
 *
 * **Accessibility.**
 *   - Real `<button>` element.
 *   - `aria-label` includes the index and
 *     the document title.
 *   - `aria-pressed` reflects whether the
 *     source panel is currently showing
 *     this citation.
 *   - Tab + Enter / Space both activate.
 *
 * **Why a separate component, not
 * reusing F4's `CitationChip`.** The
 * F4 `CitationChip` reads from a global
 * Zustand store (`citationPanelStore`) and
 * is bound to the F4 `useResolvedCitations`
 * data flow. The marketing demo is a
 * standalone, public, auth-free surface
 * — it must not pull in the F4 auth
 * store, the F4 `useResolvedCitations`
 * hook, or any F4 dependencies. The
 * visual treatment is mirrored, not the
 * implementation.
 */
"use client"

import { type KeyboardEvent, type MouseEvent } from "react"

import { cn } from "@cortex/ui"

import type { DemoCitation as DemoCitationData } from "./demo-data"

interface DemoCitationProps {
  /** The full citation payload. */
  citation: DemoCitationData
  /** Whether this citation's source panel
   *  is currently open. */
  isActive: boolean
  /** Called when the user clicks the chip
   *  (or presses Enter / Space). */
  onOpen: (id: string) => void
}

export function DemoCitation({ citation, isActive, onOpen }: DemoCitationProps) {
  const label = citation.documentTitle
    ? `View source citation ${citation.index}, ${citation.documentTitle}`
    : `View source citation ${citation.index}`

  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault()
    e.stopPropagation()
    onOpen(citation.id)
  }

  function handleKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      e.stopPropagation()
      onOpen(citation.id)
    }
  }

  return (
    <sup className="ml-0.5">
      <button
        type="button"
        onClick={handleClick}
        onKeyDown={handleKey}
        aria-label={label}
        aria-pressed={isActive}
        data-testid={`demo-citation-${citation.id}`}
        data-citation-id={citation.id}
        className={cn(
          "inline-flex h-[1.4em] min-w-[1.4em] items-center justify-center",
          "rounded-full px-1 align-baseline text-[0.65em] font-semibold leading-none",
          "transition-colors duration-fast",
          "border border-ember-500/40 bg-ember-500/10 text-ember-600",
          "hover:bg-ember-500/20 hover:border-ember-500/60",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-500/50",
          "focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          isActive && "bg-ember-500/25 border-ember-500/70",
        )}
      >
        {citation.index}
      </button>
    </sup>
  )
}
