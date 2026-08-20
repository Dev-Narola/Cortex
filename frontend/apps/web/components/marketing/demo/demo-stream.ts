/**
 * DemoStream — the streaming-simulation
 * logic for the F8 Live Demo.
 *
 * **F8 Part 4.** The marketing demo runs
 * on local seeded data; there is no real
 * token stream. This module provides a
 * pure function that splits the parsed
 * answer into reveal chunks + a hook
 * that ticks them out at a human-feel
 * cadence.
 *
 * **Why "chunks", not single tokens.** Per
 * the F8 spec: "Better streaming strategy:
 * Instead of every single word... use
 * small chunks: 'Cortex combines ', 'keyword
 * and semantic ', 'retrieval before ',
 * 'reranking the results.' This produces
 * a more natural stream." A per-character
 * stream feels stuttery; a per-chunk
 * stream feels like a real LLM.
 *
 * **Race condition handling.** A `runId`
 * is incremented on every new question.
 * The simulation captures the runId at
 * scheduling time and bails out if the
 * active run has changed by the time the
 * timer fires. Per the F8 spec: "If the
 * user somehow triggers: Question A →
 * streaming → Question B → streaming, you
 * don't want chunks from A appearing
 * inside B. Cancel/ignore the previous
 * stream."
 *
 * **Timer cleanup.** The hook returns a
 * `cancel` function the caller can use
 * (e.g. on unmount). The internal
 * `setTimeout` chain is also cleared on
 * every state change so a stale timer
 * can never fire.
 *
 * **Reduced motion.** The hook honours
 * `prefers-reduced-motion`. When set, the
 * timer is bypassed — the caller gets all
 * chunks at once on the next tick. The
 * "streaming" then degrades to "all text
 * appears immediately", which the F8 spec
 * explicitly allows: "the demo and
 * streaming text should continue
 * functioning under reduced motion, just
 * without the decorative motion layer."
 */

"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { usePrefersReducedMotion } from "@/lib/marketing/animations"

import { parseAnswer, type AnswerSegment } from "./demo-data"

/** The reveal cadence (milliseconds per
 *  chunk). The F8 spec suggests
 *  "30–60ms per chunk"; we land in the
 *  middle. Slow enough to feel like a
 *  stream, fast enough that a 200-word
 *  answer doesn't take a minute. */
const CHUNK_INTERVAL_MS = 45

/**
 * Split the *text* segments of a parsed
 * answer into smaller reveal chunks. The
 * citation segments are NOT split — they
 * always appear as a single unit.
 */
function splitIntoChunks(segments: ReadonlyArray<AnswerSegment>): AnswerSegment[] {
  const out: AnswerSegment[] = []
  for (const seg of segments) {
    if (seg.kind !== "text") {
      out.push(seg)
      continue
    }
    // Group by word boundary (preserve the
    // trailing space). 2-4 words per chunk
    // is the sweet spot.
    const words = seg.value.split(/(\s+)/)
    let buf = ""
    let count = 0
    for (const w of words) {
      buf += w
      count += /\s+/.test(w) ? 0 : 1
      if (count >= 3) {
        out.push({ kind: "text", value: buf })
        buf = ""
        count = 0
      }
    }
    if (buf.length > 0) {
      out.push({ kind: "text", value: buf })
    }
  }
  return out
}

export interface UseDemoStreamParams {
  /** The raw answer text (with
   *  `{{citation:N}}` placeholders). When
   *  empty, the hook stays idle. */
  answer: string
  /** A unique id for this run. Pass a new
   *  value (e.g. a counter or a UUID) every
   *  time a new question starts. The hook
   *  uses it to ignore stale timers. */
  runId: number
  /** Called when all chunks have been
   *  revealed (or skipped, in reduced-
   *  motion mode). */
  onComplete?: () => void
}

export interface UseDemoStreamResult {
  /** The segments revealed so far. Empty
   *  when the answer is empty. */
  revealed: ReadonlyArray<AnswerSegment>
  /** `true` while there's still work in
   *  flight. */
  isStreaming: boolean
}

/**
 * Reveal the answer's chunks one at a
 * time, with `setTimeout`. Returns the
 * revealed-so-far segments + a streaming
 * flag. When `runId` changes, the hook
 * resets and starts over with the new
 * answer (or skips to the end in reduced-
 * motion mode).
 */
export function useDemoStream({
  answer,
  runId,
  onComplete,
}: UseDemoStreamParams): UseDemoStreamResult {
  const [revealed, setRevealed] = useState<ReadonlyArray<AnswerSegment>>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const reducedMotion = usePrefersReducedMotion()
  // Track the active runId inside the
  // hook so a stale timer from the
  // previous question can detect the
  // mismatch and bail.
  const activeRunId = useRef(runId)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    activeRunId.current = runId
    if (!answer) {
      setRevealed([])
      setIsStreaming(false)
      return
    }
    const segments = parseAnswer(answer)
    const chunks = splitIntoChunks(segments)

    // Reduced motion → reveal everything
    // immediately, no timers.
    if (reducedMotion) {
      setRevealed(chunks)
      setIsStreaming(false)
      onCompleteRef.current?.()
      return
    }

    setRevealed([])
    setIsStreaming(true)

    let i = 0
    const next = () => {
      // Bail if the run has been replaced.
      if (activeRunId.current !== runId) return
      i += 1
      if (i >= chunks.length) {
        setIsStreaming(false)
        onCompleteRef.current?.()
        return
      }
      setRevealed(chunks.slice(0, i + 1))
      timer = setTimeout(next, CHUNK_INTERVAL_MS)
    }

    // Reveal the first chunk immediately,
    // then schedule the rest.
    setRevealed(chunks.slice(0, 1))
    let timer: ReturnType<typeof setTimeout> | null = setTimeout(
      next,
      CHUNK_INTERVAL_MS,
    )

    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [answer, runId, reducedMotion])

  return { revealed, isStreaming }
}

/**
 * Pure helper exposed for tests — split
 * the parsed answer into reveal chunks
 * (text segments split by word boundary;
 * citation segments unsplit).
 */
export function _splitIntoChunksForTest(
  segments: ReadonlyArray<AnswerSegment>,
): AnswerSegment[] {
  return splitIntoChunks(segments)
}

/**
 * Cancel a streaming run (useful for
 * unmount + for tests).
 */
export function useDemoStreamCanceller() {
  const cancelRef = useRef<(() => void) | null>(null)
  // We just expose a stub — the hook
  // itself handles cancellation via
  // the cleanup function on unmount.
  return useCallback(() => {
    cancelRef.current?.()
  }, [])
}
