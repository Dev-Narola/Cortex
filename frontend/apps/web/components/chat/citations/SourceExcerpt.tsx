/**
 * SourceExcerpt — the chunk text shown
 * inside the citation panel.
 *
 * **F4 Part 3 (Task 48).** Renders the
 * citation's `excerpt` field, which the
 * backend's `CitationSchema` ships as
 * `chunk.content` (or a fragment thereof).
 *
 * **No fake excerpts.** If the underlying
 * stream did not include an excerpt
 * (Task 58: the source is gone or was
 * never materialised), we render a
 * "Source unavailable" state. We never
 * invent a paragraph to fill the panel.
 *
 * **No code-block styling by default.**
 * The design system uses Body M for
 * citation excerpts; a `prose` style would
 * be heavier than the citation needs.
 * Whitespace is preserved because chunk
 * content often contains structural
 * whitespace (lists, indented code).
 */

import { type ReactNode } from "react"

import { Icon } from "@cortex/ui"

import type { Citation } from "@/types/citation"

export interface SourceExcerptProps {
  citation: Citation
  className?: string
}

export function SourceExcerpt({
  citation,
  className,
}: SourceExcerptProps): ReactNode {
  // Defensive: the V3 stream always
  // includes an excerpt, but the reload
  // case (where the chunk ids are on the
  // message but the citation metadata is
  // not) may produce a `null` excerpt. In
  // that case we surface the spec's
  // "Source unavailable" message (Task
  // 58) rather than rendering an empty
  // block.
  if (!citation.excerpt) {
    return (
      <div
        data-citation-excerpt
        data-citation-excerpt-state="unavailable"
        className={
          "flex items-start gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground " +
          (className ?? "")
        }
      >
        <Icon
          name="TriangleAlert"
          className="mt-0.5 h-3.5 w-3.5 shrink-0"
        />
        <div>
          <p className="font-medium text-foreground/80">
            Source unavailable
          </p>
          <p className="text-xs text-muted-foreground">
            The chunk metadata is no longer in this session. The
            conversation can be re-streamed to refresh citations.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      data-citation-excerpt
      data-citation-excerpt-state="ready"
      className={
        "rounded-md border border-border bg-card/40 px-4 py-3 text-sm leading-relaxed text-foreground/90 " +
        (className ?? "")
      }
    >
      <p className="whitespace-pre-wrap break-words">
        {citation.excerpt}
      </p>
    </div>
  )
}
