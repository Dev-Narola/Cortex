/**
 * DocumentIngestionProgress — a thin progress
 * line that tracks the document's ingestion
 * lifecycle.
 *
 * **F3 Part 4 (Task 39).** The bar is a pure
 * visual: it maps the document's current status
 * to a percentage (per the spec):
 *
 *   pending    → 0%
 *   parsing    → 25%
 *   chunking   → 50%
 *   embedding  → 75%
 *   indexed    → 100%
 *   failed     → "Failed" pill (no progress)
 *
 * **No fake progress.** The bar is a function
 * of the document's *current* status only.
 * There is no `setTimeout` interpolating
 * between states. The spec is explicit: the
 * backend is the source of truth; this is a
 * visual surface.
 *
 * **Cross-fade.** The status badge already
 * cross-fades via React's normal
 * reconciliation (the F1 `Badge` re-renders).
 * The bar animates with a CSS transition on
 * `width` so the change feels smooth.
 *
 * **Accessibility.** The bar has a
 * `role="progressbar"` + `aria-valuenow` so
 * screen readers announce the status
 * transition. The `aria-label` matches the
 * `DocumentStatusBadge` label.
 */

import type { ReactNode } from "react"

import { statusLabel, statusProgress, type DocumentStatus } from "@/lib/documents/status"

export interface DocumentIngestionProgressProps {
  status: DocumentStatus
  /** Optional className passthrough. */
  className?: string
}

export function DocumentIngestionProgress({
  status,
  className,
}: DocumentIngestionProgressProps): ReactNode {
  // Failed: render a small error pill instead
  // of a progress bar. The spec says "failed
  // should be treated as an error state rather
  // than pretending progress completed."
  if (status === "failed") {
    return (
      <div
        className={"flex items-center gap-1.5 " + (className ?? "")}
        role="status"
        aria-label={statusLabel(status)}
      >
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full bg-destructive"
        />
        <span className="text-[10px] font-medium uppercase tracking-wide text-destructive">
          Failed
        </span>
      </div>
    )
  }

  const value = statusProgress(status)
  const label = statusLabel(status)

  return (
    <div
      className={"flex items-center gap-2 " + (className ?? "")}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="relative h-1 flex-1 overflow-hidden rounded-full bg-muted/60"
        aria-hidden
      >
        <div
          className="h-full rounded-full bg-ember-500 transition-[width] duration-300 ease-out"
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="min-w-[5.5rem] text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  )
}
