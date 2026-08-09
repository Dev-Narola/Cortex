/**
 * CitationChip — the inline marker in the
 * assistant's answer.
 *
 * **F4 Part 3 (Tasks 41, 42, 61).** Small
 * superscript Ember button. Clicking it
 * opens the citation panel via the
 * `citationPanelStore`. The chip does not
 * fetch anything — the parent owns
 * navigation, the panel owns the data
 * fetch.
 *
 * **Visual.** A subtle rounded pill that
 * lives inside the running text. The
 * superscript treatment (`<sup>`) keeps the
 * marker small without breaking the
 * line-height the assistant message uses.
 *
 * **Accessibility (Task 61).**
 *   - Real `<button>` element, not a
 *     `<span onClick>`.
 *   - `aria-label` includes the index AND
 *     the document title (when known) so a
 *     screen reader user hears "View source
 *     citation 1, Cortex architecture
 *     document" instead of just "1".
 *   - `aria-pressed` reflects whether the
 *     panel is currently showing this
 *     citation.
 *   - Tab + Enter / Space both activate.
 *
 * **The chip never lies.** It only renders
 * when the parent has already resolved a
 * real citation (Task 40: no fake
 * markers). If the underlying source
 * disappears, the chip stays — but the
 * panel surfaces "Source unavailable".
 */

"use client"

import { type KeyboardEvent, type MouseEvent, type ReactNode } from "react"

import { cn } from "@cortex/ui"

import { citationPanelStore, useCitationPanelStore } from "@/hooks/chat/citationPanelStore"

export interface CitationChipProps {
  /** Stable id from the resolver. */
  id: string
  /** 1-based index. Renders as `[1]`. */
  index: number
  /** Document title for screen-reader
   *  context. Optional — the chip still
   *  renders without it. */
  documentTitle?: string
  /**
   * Override the active selection. Most
   * callers should leave this undefined —
   * the chip reads the panel store directly
   * to keep `aria-pressed` in sync with the
   * user's selection. The prop exists for
   * tests + the rare case where a parent
   * wants to lock the visual state.
   */
  isActive?: boolean
  /** Extra className passthrough. */
  className?: string
}

export function CitationChip({
  id,
  index,
  documentTitle,
  isActive: isActiveProp,
  className,
}: CitationChipProps): ReactNode {
  // Read the panel's selection directly so
  // `aria-pressed` stays in sync without
  // prop-drilling from the bubble. The
  // prop is an explicit override; the
  // store-derived value is the default.
  const selectedCitationId = useCitationPanelStore(
    (s) => s.selectedCitationId,
  )
  const isActive = isActiveProp ?? selectedCitationId === id
  const label = documentTitle
    ? `View source citation ${index}, ${documentTitle}`
    : `View source citation ${index}`

  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault()
    e.stopPropagation()
    citationPanelStore.open(id)
  }

  function handleKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      e.stopPropagation()
      citationPanelStore.open(id)
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
        data-citation-id={id}
        data-citation-index={index}
        className={cn(
          "inline-flex h-[1.4em] min-w-[1.4em] items-center justify-center",
          "rounded-full px-1 align-baseline text-[0.65em] font-semibold leading-none",
          "transition-colors duration-fast",
          "border border-ember-500/40 bg-ember-500/10 text-ember-600",
          "hover:bg-ember-500/20 hover:border-ember-500/60",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-500/50",
          "focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          isActive && "bg-ember-500/25 border-ember-500/70",
          className,
        )}
      >
        {index}
      </button>
    </sup>
  )
}
