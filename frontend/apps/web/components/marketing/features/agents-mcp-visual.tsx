/**
 * AgentsMcpVisual — the "agent trace" for
 * the F8 Agents + MCP section.
 *
 * **F8 Part 3.** The third of the four
 * feature beats. The marketing message is
 * that Cortex can reason over a multi-step
 * task and call external tools via MCP
 * (the Model Context Protocol) — the same
 * protocol the product uses internally.
 *
 * **What the visual shows.** A simplified
 * vertical agent trace:
 *
 *   Request
 *      ↓
 *   Agent
 *      ↓
 *   Plan
 *      ↓
 *   Retrieve (search)
 *      ↓
 *   Tool (via MCP)
 *      ↓
 *   Result
 *
 * Each stage lights up sequentially. The
 * "Tool" stage connects to MCP, which
 * routes to a generic "service" — per the
 * F8 spec: "Don't claim integrations that
 * Cortex does not actually support... Use
 * generic 'service' / 'tool' rather than
 * 'Slack / Notion / GitHub' etc."
 *
 * **Animation.**
 * - 0ms: first stage (Request) appears.
 * - 200ms: Agent
 * - 400ms: Plan
 * - 600ms: Retrieve
 * - 800ms: Tool (MCP)
 * - 1000ms: Result + final state
 *
 * All sub-stages are CSS-driven via
 * `transition-delay` — no per-stage JS.
 * The trace plays once on scroll-in
 * (`useInView`).
 *
 * **Reduced motion.** `useInView` fires
 * `onEnter` immediately when reduced
 * motion is set, so the trace lands in
 * its final state (all 6 stages lit)
 * without the sequential choreography.
 *
 * **Decorative.** Marked `aria-hidden` on
 * the root. The eyebrow + title +
 * description in the FeatureSection
 * wrapper carry the meaning.
 */
"use client"

import { useCallback, useRef } from "react"

import { useInView } from "@/lib/marketing/animations"

interface TraceStage {
  id: string
  label: string
  /** Optional sub-label (e.g. "via MCP"). */
  detail?: string
  /** When true, the stage uses the Spark
   *  gradient (the "active" stage in the
   *  trace). */
  accent?: boolean
}

const STAGES: ReadonlyArray<TraceStage> = [
  { id: "request", label: "Request" },
  { id: "agent", label: "Agent" },
  { id: "plan", label: "Plan" },
  { id: "retrieve", label: "Retrieve" },
  { id: "tool", label: "Tool", detail: "via MCP", accent: true },
  { id: "result", label: "Result" },
]

const STAGE_DELAY_MS = 200

export function AgentsMcpVisual() {
  const ref = useRef<HTMLDivElement>(null)
  const onEnter = useCallback(() => {
    if (ref.current) {
      ref.current.dataset.revealed = "true"
    }
  }, [])
  useInView(ref, onEnter)

  return (
    <div
      ref={ref}
      aria-hidden
      data-testid="agents-mcp-visual"
      data-revealed="false"
      className="relative mx-auto w-full max-w-md"
    >
      <ol className="relative space-y-2">
        {/* Vertical connector line. */}
        <div
          aria-hidden
          className="absolute left-4 top-3 bottom-3 w-px bg-gradient-to-b from-ember-300/30 via-volt-400/30 to-ember-300/30"
        />
        {STAGES.map((stage, i) => {
          const delayMs = i * STAGE_DELAY_MS
          return (
            <li
              key={stage.id}
              data-testid={`agents-mcp-stage-${stage.id}`}
              className="relative flex items-center gap-3 rounded-lg border border-border/60 bg-background/80 px-3 py-2 opacity-0 translate-y-2 transition-all duration-400 ease-out [transition-delay:var(--stage-delay)] data-[revealed=true]:opacity-100 data-[revealed=true]:translate-y-0"
              style={{ ["--stage-delay" as string]: `${delayMs}ms` }}
            >
              <span
                aria-hidden
                className={`relative z-10 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                  stage.accent
                    ? "bg-spark text-paper-50 shadow-spark"
                    : "border border-border bg-background text-muted-foreground"
                }`}
              >
                {i + 1}
              </span>
              <div className="flex-1">
                <p
                  className={`text-sm font-medium ${
                    stage.accent ? "text-spark" : "text-foreground"
                  }`}
                >
                  {stage.label}
                </p>
                {stage.detail ? (
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {stage.detail}
                  </p>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
      <p className="mt-4 text-center text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        Reasoning → tools → result
      </p>
    </div>
  )
}
