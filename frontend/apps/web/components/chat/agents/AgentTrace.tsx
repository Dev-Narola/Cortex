"use client"

/**
 * AgentTrace — the collapsed/expandable trace for a
 * single agent run.
 *
 * **F5 Part 3 (Tasks 12, 17, 18, 19).** Collapsed
 * by default. The collapsed state shows the actual
 * step count; the expanded state renders a vertical
 * stepper of :class:`AgentTraceStep` rows.
 *
 * **Real data, no mocks.** The component reads from
 * ``useAgentToolCalls`` and renders the response
 * verbatim. The step count is the length of the
 * backend's ``tool_calls`` array, the tool names
 * are the backend's ``name`` field, the latencies
 * are the backend's ``latency_ms`` field. (Spec
 * Tasks 43-46.)
 *
 * **Fetch-on-mount (Strategy A).** The query fires
 * the moment the panel is rendered with a run id —
 * the collapsed label *must* show the real step
 * count, and the count lives in the response. The
 * network cost is one small GET per visible trace;
 * TanStack Query's 5-minute ``staleTime`` keeps
 * subsequent open/close cycles cache-only. (Spec
 * Tasks 26-28.)
 *
 * **States.** Every spec state is implemented:
 *
 *   - collapsed default with the real count
 *   - loading skeleton (first mount)
 *   - error + retry (failure path; answer
 *     remains visible)
 *   - empty tool-calls list (backend returned
 *     ``[]``; treated as "run had no trace",
 *     not an error)
 *   - expanded list
 *
 * **No color drama.** Errors are visually
 * contained inside the step card — no red
 * banner, no background tint. The spec is
 * explicit: the trace is a trust device, not
 * a marketing moment.
 *
 * **Accessibility.** The collapse trigger is a
 * real ``<button>`` with ``aria-expanded`` and
 * ``aria-controls``. The stepper is an
 * ``<ol>`` for semantic correctness.
 */

import { useState } from "react"

import {
  ChevronDown,
  Loader,
  RefreshCw,
  Sparkles,
} from "lucide-react"

import { Button } from "@cortex/ui"

import { useAgentToolCalls } from "@/hooks/agents"

import { AgentTraceStep } from "./AgentTraceStep"
import { formatLatency } from "./formatLatency"

import { cn } from "@cortex/ui"

export interface AgentTraceProps {
  /**
   * The agent run id. ``null`` / ``undefined`` /
   * empty string disables the query — the trace
   * is rendered in its collapsed default state
   * but no request fires. This is how the trace
   * stays quiet for messages that did not
   * generate an agent run.
   */
  runId: string | null | undefined
  /**
   * Optional className for the outer container.
   * The chat bubble passes its own padding
   * override; the agent run detail page does
   * not.
   */
  className?: string
  /**
   * Whether to start the trace in the expanded
   * state. Defaults to ``false`` (per the spec
   * — collapsed by default). The agent run
   * detail page passes ``true`` so the user
   * sees the trace immediately when they
   * navigate to a specific run.
   */
  defaultExpanded?: boolean
}

/** Singular / plural form for the count badge. */
function countLabel(count: number): string {
  return count === 1 ? "1 step" : `${count} steps`
}

export function AgentTrace(props: AgentTraceProps) {
  const { runId, className, defaultExpanded = false } = props

  const [expanded, setExpanded] = useState(defaultExpanded)

  const hasRunId = typeof runId === "string" && runId.length > 0
  // The query fires on mount (not on first
  // expand) so the collapsed label can show the
  // real step count. TanStack Query's 5-minute
  // staleTime keeps re-opens cache-only.
  const query = useAgentToolCalls({
    runId,
    enabled: hasRunId,
  })

  // ---- Empty states -----------------------------------------------
  // The component always renders the collapse
  // trigger (so a panel-less chat bubble still
  // shows the count) — but only when the
  // message has a run id. A normal F4 question
  // never reaches this component (the chat
  // message hides the trace when ``runId`` is
  // missing).
  if (!hasRunId) {
    return null
  }

  // ---- Render -----------------------------------------------------
  // The step count is taken from the response
  // *after* it arrives; while loading we use a
  // neutral "Loading..." so the count doesn't
  // flicker between 0 and N.
  const stepCount = query.data?.toolCalls.length ?? 0
  const collapsedLabel = query.isPending
    ? "Agent trace loading…"
    : query.isError
      ? "Agent trace couldn't be loaded"
      : `Agent used ${countLabel(stepCount)}`

  return (
    <section
      aria-label="Agent trace"
      className={cn(
        "rounded-md border border-[var(--border,#1f2937)]",
        "bg-[var(--surface,#0b1220)]/60",
        className,
      )}
      data-testid="agent-trace"
      data-run-id={runId}
    >
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-controls="agent-trace-panel"
        className={cn(
          "group flex w-full items-center gap-2 px-3 py-2 text-left",
          "text-xs text-[var(--text-muted,#9ca3af)]",
          "hover:bg-[var(--surface-muted,#111827)]/60",
          "focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-[var(--volt,#16a34a)]/40",
        )}
        data-testid="agent-trace-toggle"
      >
        <Sparkles
          className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted,#6b7280)]"
          aria-hidden="true"
        />
        <span
          className="font-medium text-[var(--text,#e5e7eb)]"
          data-testid="agent-trace-label"
        >
          {collapsedLabel}
        </span>
        <ChevronDown
          className={cn(
            "ml-auto h-3.5 w-3.5 shrink-0 transition-transform",
            expanded ? "rotate-0" : "-rotate-90",
          )}
          aria-hidden="true"
        />
      </button>

      {expanded ? (
        <div
          id="agent-trace-panel"
          className="border-t border-[var(--border,#1f2937)] px-3 py-3"
          data-testid="agent-trace-panel"
        >
          {query.isPending ? (
            <AgentTraceSkeleton />
          ) : query.isError ? (
            <AgentTraceError
              onRetry={() => {
                void query.refetch()
              }}
            />
          ) : stepCount === 0 ? (
            <AgentTraceEmpty />
          ) : (
            <ol
              className="flex flex-col gap-3"
              data-testid="agent-trace-steps"
            >
              {query.data?.toolCalls.map((tc, idx) => (
                <AgentTraceStep
                  key={tc.id}
                  index={idx + 1}
                  name={tc.name}
                  resultSummary={tc.resultSummary}
                  latencyMs={tc.latencyMs}
                  status={tc.status}
                  error={tc.error}
                  isLast={idx === stepCount - 1}
                />
              ))}
            </ol>
          )}
          {query.data ? (
            <p
              className="mt-3 text-[10px] uppercase tracking-wide text-[var(--text-muted,#6b7280)]"
              data-testid="agent-trace-run-meta"
            >
              {countLabel(stepCount)} · {formatLatency(totalLatency(query.data.toolCalls))} total
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Sub-components (kept local to the file so the
// parent's tests cover all three states)
// ---------------------------------------------------------------------------

function AgentTraceSkeleton() {
  return (
    <div
      className="flex flex-col gap-2"
      data-testid="agent-trace-skeleton"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading agent trace</span>
      {Array.from({ length: 3 }).map((_, idx) => (
        <div
          key={idx}
          className="flex animate-pulse gap-3"
          data-testid="agent-trace-skeleton-row"
        >
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--border,#1f2937)]" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-32 rounded bg-[var(--border,#1f2937)]" />
            <div className="h-2 w-48 rounded bg-[var(--border,#1f2937)]/60" />
          </div>
        </div>
      ))}
    </div>
  )
}

function AgentTraceError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="flex flex-col items-start gap-2"
      data-testid="agent-trace-error"
      role="alert"
    >
      <p className="text-xs text-[var(--text-muted,#9ca3af)]">
        Agent trace couldn't be loaded.
      </p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRetry}
        iconLeft={
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
        }
        data-testid="agent-trace-retry"
      >
        Retry
      </Button>
    </div>
  )
}

function AgentTraceEmpty() {
  return (
    <p
      className="text-xs text-[var(--text-muted,#9ca3af)]"
      data-testid="agent-trace-empty"
    >
      The agent run did not call any tools.
    </p>
  )
}

// While the panel is loading we show a tiny inline
// spinner next to the label, so the user has
// immediate feedback that the click was registered.
export function AgentTracePendingDot() {
  return (
    <Loader
      className="ml-1 inline h-3 w-3 animate-spin text-[var(--text-muted,#6b7280)]"
      aria-hidden="true"
    />
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function totalLatency(
  toolCalls: ReadonlyArray<{ latencyMs: number | null }>,
): number | null {
  const valid = toolCalls
    .map((tc) => tc.latencyMs)
    .filter((ms): ms is number => typeof ms === "number" && ms > 0)
  if (valid.length === 0) return null
  return valid.reduce((acc, ms) => acc + ms, 0)
}
