/**
 * MetadataRow — a single key/value line in the
 * document detail drawer's metadata table.
 *
 * **F3 Part 3 (Task 27).** Reused by the future
 * chunk / graph / embedding tabs (per the spec:
 * "Future Chunk, Graph, Embeddings can extend same
 * layout"). Today: a label + a value.
 *
 * **Empty / unknown.** The spec shows "File Size",
 * "Updated", "Chunk Count", and "Metadata" — but
 * the V4 `DocumentResponse` doesn't expose those
 * fields. We render them as "—" (consistent with
 * the F3 Part 2 "Chunks" column).
 */

import type { ReactNode } from "react"

import { cn } from "@cortex/ui"

export interface MetadataRowProps {
  label: string
  /** String or ReactNode. Pass `"—"` for unknown. */
  value: ReactNode
  /** Optional monospace formatting (ids, mime types, etc.). */
  monospace?: boolean
  className?: string
}

export function MetadataRow({
  label,
  value,
  monospace,
  className,
}: MetadataRowProps): ReactNode {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 border-b border-border/60 py-2 last:border-b-0",
        className,
      )}
    >
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "text-right text-sm text-foreground",
          monospace && "font-mono text-xs",
        )}
      >
        {value ?? "—"}
      </dd>
    </div>
  )
}
