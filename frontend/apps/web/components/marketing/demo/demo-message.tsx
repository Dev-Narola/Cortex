/**
 * DemoMessage — the answer bubble for the
 * F8 Live Demo.
 *
 * **F8 Part 4.** Renders the streamed
 * answer segments (text + citations) as
 * a single message bubble. The visual
 * treatment mirrors the F4 chat's
 * `MessageBubble`:
 *   - Left-aligned (assistant role).
 *   - Plain Cloud/slate surface (the
 *     marketing card background).
 *   - Citation chips are inline
 *     superscript Ember pills.
 *
 * **Streaming visual.** While the parent
 * is still receiving new chunks, the
 * message carries a subtle Spark Glow
 * around the text (per the F8 spec: "While
 * streaming: use the same visual language
 * as the actual chat screen. Spark Glow.
 * When complete: glow settles flat").
 * The glow is CSS-only (no GSAP) — the
 * global `motion.css` reduced-motion
 * override disables it automatically for
 * users who request reduced motion.
 *
 * **Decorative.** This component is part
 * of the marketing demo; it doesn't have
 * an `aria-live` (the demo is interactive,
 * not streaming autonomously).
 */
"use client"

import { useId, type ReactNode } from "react"

import type { DemoCitation } from "./demo-data"
import { DemoCitation as DemoCitationChip } from "./demo-citation"
import type { AnswerSegment } from "./demo-data"

interface DemoMessageProps {
  /** The segments revealed so far (output
   *  of `useDemoStream`). */
  segments: ReadonlyArray<AnswerSegment>
  /** The full list of citations, keyed
   *  by `id` (e.g. "citation-1"). The
   *  component uses this to resolve the
 *  citation segments to their full
 *  payload. */
  citations: ReadonlyArray<DemoCitation>
  /** The id of the currently-open
   *  citation (so the chip can reflect
   *  `aria-pressed`). */
  activeCitationId: string | null
  /** Whether the parent is still
   *  streaming. Drives the Spark Glow
   *  visual. */
  isStreaming: boolean
  /** Called when a citation chip is
   *  clicked. */
  onOpenCitation: (id: string) => void
}

export function DemoMessage({
  segments,
  citations,
  activeCitationId,
  isStreaming,
  onOpenCitation,
}: DemoMessageProps): ReactNode {
  // Look up the citation payload by the
  // *index* (not the id). The segment id
  // is `citation-1`, `citation-2`, etc.
  // (per `parseAnswer`); the entry's
  // citation id is per-entry (e.g.
  // `hybrid-1`, `kg-1`, `cite-1`). The
  // index is the natural key — it
  // matches the user-visible marker `[1]`,
  // `[2]`.
  const citationByIndex = new Map(citations.map((c) => [c.index, c]))
  const id = useId()

  return (
    <article
      aria-label={isStreaming ? "Cortex is answering" : "Cortex answer"}
      data-testid="demo-message"
      data-streaming={isStreaming ? "true" : "false"}
      className={`rounded-2xl border border-border bg-background/80 p-4 shadow-sm transition-shadow duration-base ${
        isStreaming
          ? "shadow-spark"
          : "shadow-none"
      }`}
    >
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Cortex
      </p>
      <p
        data-testid="demo-message-text"
        className="text-sm leading-relaxed text-foreground"
      >
        {segments.map((seg, i) => {
          if (seg.kind === "text") {
            return <span key={`${id}-t-${i}`}>{seg.value}</span>
          }
          // Citation segment — look up by
          // index.
          const full = citationByIndex.get(seg.index)
          if (!full) return null
          return (
            <DemoCitationChip
              key={`${id}-c-${i}`}
              citation={full}
              isActive={activeCitationId === full.id}
              onOpen={onOpenCitation}
            />
          )
        })}
        {isStreaming ? (
          // The "caret" — a small animated
          // dot at the end of the running
          // text. Reduces to a static dot
          // under reduced motion (the
          // global CSS rule).
          <span
            aria-hidden
            data-testid="demo-streaming-caret"
            className="ml-0.5 inline-block h-1.5 w-1.5 translate-y-0.5 rounded-full bg-spark motion-safe:animate-[demo-caret-blink_1s_ease-in-out_infinite]"
          />
        ) : null}
      </p>
    </article>
  )
}
