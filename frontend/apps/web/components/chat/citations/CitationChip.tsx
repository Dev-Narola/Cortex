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

import type { KeyboardEvent, MouseEvent, ReactNode } from "react"

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
  /** "inline" = superscript marker in the text; "source" = titled pill in the Sources row. */
  variant?: "inline" | "source"
  /** Extra className passthrough. */
  className?: string
}

export function CitationChip({
  id,
  index,
  documentTitle,
  isActive: isActiveProp,
  variant = "inline",
  className,
}: CitationChipProps): ReactNode {
  // Read the panel's selection directly so
  // `aria-pressed` stays in sync without
  // prop-drilling from the bubble. The
  // prop is an explicit override; the
  // store-derived value is the default.
  const selectedCitationId = useCitationPanelStore((s) => s.selectedCitationId)
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

  if (variant === "source") {
    return (
      <button
        type="button"
        onClick={handleClick}
        onKeyDown={handleKey}
        aria-label={label}
        aria-pressed={isActive}
        data-citation-id={id}
        data-citation-index={index}
        className={cn(
          "inline-flex max-w-[16rem] items-center gap-1.5 rounded-full border border-border bg-card py-0.5 pr-2.5 pl-0.5 text-xs text-muted-foreground",
          "transition-colors duration-fast hover:border-brand-border hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isActive && "border-brand-border bg-brand-soft text-foreground",
          className,
        )}
      >
        <span className="tabular flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-soft px-1 font-semibold text-brand-ink">
          {index}
        </span>
        <span className="truncate">{documentTitle ?? `Source ${index}`}</span>
      </button>
    )
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
          "border border-brand-border bg-brand-soft text-brand-ink",
          "hover:border-brand hover:bg-brand/20",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          isActive && "border-brand bg-brand/25",
          className,
        )}
      >
        {index}
      </button>
    </sup>
  )
}
