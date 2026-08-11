"use client"

/**
 * AgentTraceStep — one row in the agent trace stepper.
 *
 * **F5 Part 3 (Tasks 13 + 14).** Each step shows:
 *
 *   ●  tool_name                   420ms
 *   │  Found 5 relevant chunks
 *
 * The connector dot + vertical line use Volt, the
 * tool name uses JetBrains Mono, the latency is
 * right-aligned, the result summary wraps below
 * the name.
 *
 * **Quiet by design.** The trace is a trust
 * device, not a marketing moment. No glow, no
 * pulse, no gradient — the visual treatment is
 * Slate/Mist with a Volt connector.
 *
 * **Error treatment.** A failed call swaps the
 * icon for a small warning glyph and shows the
 * error string instead of the success summary.
 * No red banners — the spec is explicit about
 * keeping the trace visually calm. (Task 19.)
 *
 * **Last step.** The connector line does not
 * continue past the final row so the trace
 * visually ends. Implemented by passing
 * ``isLast`` from the parent and rendering the
 * line only when it's not the last step.
 * (Task 35.)
 */

import { CircleDot, TriangleAlert, Terminal } from "lucide-react"

import { formatLatency } from "./formatLatency"

import { cn } from "@cortex/ui"

export interface AgentTraceStepProps {
  /** Tool name (e.g. ``retrieve_documents``). */
  name: string
  /** One-line result summary. */
  resultSummary: string
  /** Wall-clock duration in milliseconds. */
  latencyMs: number | null
  /** ``"ok"`` / ``"error"`` / ``"unknown"``. */
  status?: "ok" | "error" | "unknown"
  /** Optional short error string for failed steps. */
  error?: string | null
  /**
   * True if this is the final step. The
   * connector line is suppressed for the last
   * step so the trace visually ends.
   */
  isLast?: boolean
  /** 1-based position; used for ``data-step-index``
   *  so tests / debugging can target a step. */
  index?: number
}

export function AgentTraceStep(props: AgentTraceStepProps) {
  const {
    name,
    resultSummary,
    latencyMs,
    status = "ok",
    error,
    isLast = false,
    index,
  } = props

  const isError = status === "error"

  return (
    <li
      className="relative flex gap-3"
      data-step-name={name}
      data-step-index={index}
      data-step-status={status}
    >
      {/* Connector column. The dot sits on the
          trace's vertical axis; the connecting
          line is rendered as an absolutely-
          positioned span that runs from the dot
          down to the next step. The last step's
          line is suppressed. */}
      <div className="relative flex w-3 shrink-0 flex-col items-center pt-1.5">
        <span
          aria-hidden="true"
          className={cn(
            "z-10 flex h-2.5 w-2.5 items-center justify-center rounded-full",
            isError
              ? "bg-[var(--warning,#f59e0b)]"
              : "bg-[var(--volt,#16a34a)]",
          )}
        />
        {!isLast ? (
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-3 h-full w-px -translate-x-1/2 bg-[var(--volt,#16a34a)]/40"
          />
        ) : null}
      </div>

      {/* Body column. Tool name + latency on the
          first row, result summary on the second
          row. Flex-wrap so long tool names don't
          push the latency out of view on mobile. */}
      <div
        className={cn(
          "min-w-0 flex-1 rounded-md border border-[var(--border,#1f2937)]",
          "bg-[var(--surface-muted,#111827)]/40 px-3 py-2",
        )}
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 font-mono text-xs",
              isError
                ? "text-[var(--warning,#f59e0b)]"
                : "text-[var(--text,#e5e7eb)]",
            )}
          >
            {isError ? (
              <TriangleAlert
                className="h-3 w-3 shrink-0"
                aria-hidden="true"
              />
            ) : name === "generate_answer" ? (
              <Terminal
                className="h-3 w-3 shrink-0 text-[var(--text-muted,#9ca3af)]"
                aria-hidden="true"
              />
            ) : null}
            <span className="break-all" data-testid="agent-step-name">
              {name}
            </span>
          </span>
          <span
            className="ml-auto font-mono text-[11px] tabular-nums text-[var(--text-muted,#9ca3af)]"
            data-testid="agent-step-latency"
          >
            {formatLatency(latencyMs)}
          </span>
        </div>
        <p
          className="mt-1 text-xs leading-relaxed text-[var(--text-muted,#9ca3af)]"
          data-testid="agent-step-summary"
        >
          {isError && error ? error : resultSummary}
        </p>
      </div>
    </li>
  )
}

/**
 * Marker exported so the parent's React list can
 * wrap the steps in a single ``<ol>`` for
 * semantic stepper markup.
 */
export const AgentTraceStepListMarker = CircleDot
