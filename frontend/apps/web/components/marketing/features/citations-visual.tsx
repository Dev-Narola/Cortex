/**
 * CitationsVisual — the "answer with
 * source" mock for the F8 Citations
 * section.
 *
 * **F8 Part 3.** The fourth of the four
 * feature beats. The marketing message
 * is that every important answer comes
 * with a citation that traces back to the
 * source document.
 *
 * **What the visual shows.** A simulated
 * chat bubble containing an answer with
 * a citation marker ([1]). Below it, a
 * source card that the marker connects
 * to. The animation is:
 *
 *   0ms    Answer bubble appears.
 *   400ms  Citation marker [1] appears
 *          inside the answer.
 *   700ms  Source card slides in below.
 *   1000ms  Connection line draws
 *          from the marker to the source.
 *
 * **Final state is readable without the
 * animation.** All three pieces
 * (answer, marker, source) are in the
 * DOM from first paint. Reduced motion
 * fires `onEnter` immediately so the
 * visual lands in its final state.
 *
 * **Decorative source names.** Per the F8
 * spec: "Don't expose internal project
 * files... Use fictional/neutral sample
 * source names in the UI." We use
 * "Retrieval Notes.md" and
 * "Tenant Isolation.md" — both plausible
 * user documents, neither a real Cortex
 * project file.
 *
 * **Decorative.** Marked `aria-hidden` on
 * the root. The eyebrow + title +
 * description in the FeatureSection
 * wrapper carry the meaning.
 */
"use client"

import { useCallback, useRef } from "react"

import { useInView } from "@/lib/marketing/animations"

export function CitationsVisual() {
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
      data-testid="citations-visual"
      data-revealed="false"
      className="relative mx-auto w-full max-w-2xl"
    >
      {/* Answer card. */}
      <div
        data-testid="citations-answer"
        className="rounded-xl border border-border bg-background/80 p-4 shadow-sm backdrop-blur-sm transition-all duration-500 ease-out data-[revealed=true]:opacity-100 data-[revealed=true]:translate-y-0 opacity-0 translate-y-3"
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Answer
        </p>
        <p className="mt-2 text-sm leading-relaxed text-foreground">
          Cortex combines keyword and semantic search
          <span
            data-testid="citation-marker-1"
            className="ml-0.5 inline-flex h-5 w-5 translate-y-0.5 items-center justify-center rounded-full bg-spark font-mono text-[10px] font-semibold text-paper-50 opacity-0 shadow-spark transition-all duration-300 ease-out [transition-delay:400ms] data-[revealed=true]:opacity-100 data-[revealed=true]:scale-100 scale-75"
          >
            1
          </span>
          , then reranks the fused candidates before generating the
          final answer.
        </p>
      </div>

      {/* Connector line. */}
      <div
        aria-hidden
        className="mx-auto my-2 h-6 w-px bg-gradient-to-b from-ember-400/60 to-volt-400/60 opacity-0 transition-opacity duration-300 ease-out [transition-delay:1000ms] data-[revealed=true]:opacity-100"
      />

      {/* Source card. */}
      <div
        data-testid="citations-source-1"
        className="rounded-xl border border-ember-500/40 bg-gradient-to-br from-ember-100/40 via-background to-volt-100/40 p-4 shadow-spark transition-all duration-500 ease-out [transition-delay:700ms] data-[revealed=true]:opacity-100 data-[revealed=true]:translate-y-0 opacity-0 translate-y-3"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-spark font-mono text-xs font-semibold text-paper-50 shadow-sm"
          >
            1
          </span>
          <div className="flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Source
            </p>
            <p
              className="mt-1 font-mono text-sm font-medium text-foreground"
              data-testid="citation-source-name"
            >
              Retrieval Notes.md
            </p>
            <p className="text-xs text-muted-foreground">
              Section: Hybrid Retrieval · Page 12
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
