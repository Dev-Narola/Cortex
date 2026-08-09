/**
 * CitationSourceHeader — the title block at
 * the top of the citation panel.
 *
 * **F4 Part 3 (Task 47).** Shows:
 *   - Document title (the primary header)
 *   - "Chunk N" subheader (when `chunkIndex` is known)
 *
 * Per Task 50 we deliberately do NOT render
 * empty placeholders for missing metadata.
 * If the citation's `chunkIndex` is not
 * available, we skip the subheader line.
 *
 * Per Task 49, the title uses the Body M /
 * Heading scale (the design system exposes
 * `text-base` / `text-sm`/`text-xs`); the
 * document title is the "primary" line, the
 * chunk metadata is a "caption" line below.
 *
 * **Type.** The Citation domain carries
 * `documentTitle` (the WS stream includes
 * it directly — see backend `Citation`).
 * The chunk-level title isn't separately
 * needed; the `documentTitle` + the chunk
 * index uniquely identify the source.
 */

import { type ReactNode } from "react"

import { Icon } from "@cortex/ui"

import type { Citation } from "@/types/citation"

export interface CitationSourceHeaderProps {
  citation: Citation
  className?: string
}

export function CitationSourceHeader({
  citation,
  className,
}: CitationSourceHeaderProps): ReactNode {
  // The stream always provides
  // `documentTitle` for citations. We
  // fall back to a stable id-based label
  // if the backend ever ships a citation
  // without it (defensive — should never
  // happen on the V3 contract).
  const title = citation.documentTitle?.trim() || "Source document"

  return (
    <header
      data-citation-source-header
      className={"flex flex-col gap-1.5 " + (className ?? "")}
    >
      <div className="flex items-start gap-2">
        <Icon
          name="FileText"
          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
        />
        <h3 className="line-clamp-2 text-sm font-semibold tracking-tight text-foreground">
          {title}
        </h3>
      </div>
      <p className="pl-6 text-[11px] uppercase tracking-wide text-muted-foreground">
        Chunk {citation.chunkIndex + 1}
      </p>
    </header>
  )
}
