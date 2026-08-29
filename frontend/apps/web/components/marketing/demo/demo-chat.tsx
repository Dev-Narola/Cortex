/**
 * DemoChat — the orchestrator for the F8
 * Live Demo.
 *
 * **F8 Part 4.** Owns the demo's state
 * machine:
 *
 *   idle
 *     ↓ (chip click / submit)
 *   submitting
 *     ↓
 *   streaming
 *     ↓
 *   complete
 *
 *   ↑ (new question resets to idle)
 *
 * **State management.** Local component
 * state only. The marketing demo has no
 * server data, no auth, no tenant — a
 * Zustand store would be over-engineering.
 * The F8 spec is explicit: "Don't
 * introduce a state-management library for
 * this. Local component state is appropriate
 * because this is not server data."
 *
 * **Race condition handling.** Each new
 * question increments `runId`. The
 * streaming hook checks `runId` to ignore
 * stale timers (per the F8 spec: "If the
 * user somehow triggers: Question A →
 * streaming → Question B → streaming, you
 * don't want chunks from A appearing
 * inside B. Cancel/ignore the previous
 * stream.").
 *
 * **Initial state.** Before the visitor
 * asks anything, the chat shows the
 * "empty" message: "Ask Cortex a question"
 * with the example chips visible above
 * the input. After the first question,
 * the empty state is replaced by the
 * actual answer.
 *
 * **Citation interaction.** The chat owns
 * the `activeCitationId` state. Clicking
 * a chip sets it; clicking the same chip
 * again, or pressing Escape, or clicking
 * the panel's close button, clears it.
 */
"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  DEMO_SOURCE_VIEWED,
  LIVE_DEMO_COMPLETED,
  LIVE_DEMO_QUESTION_SUBMITTED,
  LIVE_DEMO_STARTED,
  track,
} from "@/lib/analytics"

import { DEMO_ENTRIES, type DemoEntry, getSeededDemo } from "./demo-data"
import { DemoInput } from "./demo-input"
import { DemoMessage } from "./demo-message"
import { DemoQuestionChips } from "./demo-question-chips"
import { DemoSourcePanel } from "./demo-source-panel"
import { useDemoStream } from "./demo-stream"

type DemoStatus = "idle" | "submitting" | "streaming" | "complete" | "error"

export function DemoChat() {
  const [inputValue, setInputValue] = useState("")
  const [status, setStatus] = useState<DemoStatus>("idle")
  const [activeDemoId, setActiveDemoId] = useState<string | null>(null)
  const [activeCitationId, setActiveCitationId] = useState<string | null>(null)
  const [runId, setRunId] = useState(0)
  // The currently active demo entry (so
  // the message knows which citations to
  // resolve against).
  const [activeEntry, setActiveEntry] = useState<DemoEntry | null>(null)
  const runIdRef = useRef(runId)
  runIdRef.current = runId

  // The streaming hook.
  const { revealed, isStreaming } = useDemoStream({
    answer: activeEntry?.answer ?? "",
    runId,
    onComplete: () => {
      // Only update status if the run
      // hasn't been replaced.
      if (runIdRef.current === runId) {
        setStatus("complete")
        // F10-Part 4: live_demo_completed fires
        // when the streamed answer resolves.
        // Includes the citation count as a
        // quality signal. The runId guard
        // ensures stale completions don't
        // double-count.
        track(LIVE_DEMO_COMPLETED, {
          section: "live_demo",
          citation_count: activeEntry?.citations.length ?? 0,
        })
      }
    },
  })

  // F10-Part 4: live_demo_started fires once
  // on first interaction. Subsequent questions
  // in the same session emit
  // live_demo_question_submitted instead.
  const demoStartedRef = useRef(false)
  useEffect(() => {
    if (status === "submitting" && !demoStartedRef.current) {
      demoStartedRef.current = true
      track(LIVE_DEMO_STARTED, { section: "live_demo" })
    }
  }, [status])

  // The "submitting" state lasts a tick
  // — we don't want a jarring jump from
  // idle → streaming. The streaming hook
  // sets `isStreaming` to true on the
  // first chunk; we update status
  // immediately on submit so the input
  // disables.
  const ask = useCallback((rawQuestion: string) => {
    const q = rawQuestion.trim()
    if (!q) return
    const entry = getSeededDemo(q)
    // If the question doesn't match a
    // seeded entry, fall back to the
    // first demo (so the visitor always
    // sees *something* — the spec is
    // explicit that the marketing demo
    // should always function end-to-end).
    const fallback = entry ?? DEMO_ENTRIES[0]
    if (!fallback) return
    const nextRunId = runIdRef.current + 1
    setActiveDemoId(fallback.id)
    setActiveCitationId(null)
    setInputValue(fallback.question)
    setActiveEntry(fallback)
    setStatus("submitting")
    setRunId(nextRunId)
    // F10-Part 4: every ask is a
    // question_submitted (whether it's the
    // first one or a follow-up). The
    // live_demo_started event is emitted
    // separately, once per session.
    track(LIVE_DEMO_QUESTION_SUBMITTED, { section: "live_demo" })
  }, [])

  const onChipSelect = useCallback(
    (entry: DemoEntry) => {
      // Clicking a chip populates the
      // input AND auto-submits (per the F8
      // spec: "click chip → populate input
      // → automatically start demo because
      // it reduces friction").
      ask(entry.question)
    },
    [ask],
  )

  const onInputChange = useCallback((next: string) => {
    setInputValue(next)
  }, [])

  const onInputSubmit = useCallback(() => {
    ask(inputValue)
  }, [ask, inputValue])

  const onOpenCitation = useCallback((id: string) => {
    setActiveCitationId((current) => {
      const next = current === id ? null : id
      // F10-Part 4: source panel open fires
      // demo_source_viewed. Closing the
      // panel (next === null) does NOT fire —
      // this is an open-counter, not a
      // toggle-counter, so we don't
      // over-count in the funnel.
      if (next !== null) {
        track(DEMO_SOURCE_VIEWED, { section: "live_demo" })
      }
      return next
    })
  }, [])

  const onPanelOpenChange = useCallback((open: boolean) => {
    if (!open) setActiveCitationId(null)
  }, [])

  const onRetry = useCallback(() => {
    if (activeEntry) {
      ask(activeEntry.question)
    }
  }, [activeEntry, ask])

  // The "active" citation (for the
  // panel + the chip's aria-pressed).
  const activeCitation = useMemo(() => {
    if (!activeCitationId) return null
    return activeEntry?.citations.find((c) => c.id === activeCitationId) ?? null
  }, [activeCitationId, activeEntry])

  // ── Rendering ──────────────────────────────────────────
  const isBusy = status === "submitting" || isStreaming
  const showMessage = status !== "idle" && status !== "error" && activeEntry !== null

  return (
    <div data-testid="demo-chat" className="space-y-4">
      <DemoQuestionChips activeDemoId={activeDemoId} disabled={isBusy} onSelect={onChipSelect} />

      {/* The chat surface. A rounded card
          with a paper/slate background so the
          demo reads as the *product*, not as
          more marketing. */}
      <div
        className="rounded-2xl border border-border bg-background/80 p-4 shadow-sm backdrop-blur-sm"
        aria-live="polite"
      >
        {status === "idle" ? (
          <DemoEmptyState />
        ) : showMessage && activeEntry ? (
          <DemoMessage
            segments={revealed}
            citations={activeEntry.citations}
            activeCitationId={activeCitationId}
            isStreaming={isStreaming}
            onOpenCitation={onOpenCitation}
          />
        ) : null}

        {status === "submitting" ? (
          <p className="mt-2 text-xs text-muted-foreground" data-testid="demo-submitting">
            Cortex is thinking…
          </p>
        ) : null}

        {status === "error" ? (
          <div
            data-testid="demo-error"
            className="mt-2 flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3"
          >
            <p className="text-xs text-destructive">Something went wrong. Try the example again.</p>
            <button
              type="button"
              onClick={onRetry}
              className="rounded-md border border-border bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt-500"
            >
              Try again
            </button>
          </div>
        ) : null}
      </div>

      <DemoInput
        value={inputValue}
        onChange={onInputChange}
        onSubmit={onInputSubmit}
        disabled={isBusy}
        placeholder="Ask Cortex a question…"
      />

      <DemoSourcePanel
        citation={activeCitation}
        open={activeCitationId !== null}
        onOpenChange={onPanelOpenChange}
      />
    </div>
  )
}

function DemoEmptyState() {
  return (
    <div
      data-testid="demo-empty-state"
      className="flex flex-col items-center gap-2 py-8 text-center"
    >
      <p className="text-base font-medium text-foreground">Ask Cortex a question</p>
      <p className="max-w-md text-sm text-muted-foreground">
        Search, connect, reason, and cite — pick an example above or type your own.
      </p>
    </div>
  )
}
