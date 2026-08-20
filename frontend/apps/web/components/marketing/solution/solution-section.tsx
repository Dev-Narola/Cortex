/**
 * SolutionSection — the F8 marketing "Solution"
 * beat.
 *
 * **F8 Part 2.** The bridge from problem to
 * feature story. The design philosophy is
 * explicit: the solution is deliberately
 * **one sentence** (or close to it). The
 * user journey is:
 *
 *   problem
 *     ↓
 *   solution, one sentence
 *     ↓
 *   feature beats
 *
 * So this section doesn't try to be
 * another giant section. It just makes the
 * conceptual transformation explicit and
 * hands the page to the first feature.
 *
 * **Why "Scattered → Connected".** The PRD
 * is unambiguous: Cortex's product vision
 * is to make private organizational
 * knowledge easy to query, reason over,
 * and act on safely. The "scattered →
 * connected" framing is the natural
 * way to express that without explaining
 * every feature in one breath.
 *
 * **Animation.** A simple fade-up. The
 * "scattered → connected" word swap is a
 * small DOM update driven by the
 * `data-revealed` flag set by `useInView`;
 * no JS timeline, no GSAP.
 */
"use client"

import { useCallback, useRef } from "react"

import { Container, Text } from "@cortex/ui"

import { useInView } from "@/lib/marketing/animations"

export function SolutionSection() {
  const ref = useRef<HTMLDivElement>(null)
  const onEnter = useCallback(() => {
    if (ref.current) {
      ref.current.dataset.revealed = "true"
    }
  }, [])
  useInView(ref, onEnter)

  return (
    <section
      id="solution"
      aria-labelledby="solution-heading"
      className="relative border-t border-border/60 bg-background/40 py-20 md:py-28"
    >
      <Container size="md" className="text-center">
        <div
          ref={ref}
          data-testid="solution-section"
          className="space-y-6 transition-all duration-[600ms] ease-out opacity-0 translate-y-4 will-change-transform data-[revealed=true]:opacity-100 data-[revealed=true]:translate-y-0"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            The solution
          </p>
          <h2
            id="solution-heading"
            className="font-display text-3xl font-semibold leading-[1.15] tracking-tight text-foreground sm:text-4xl md:text-5xl"
          >
            Cortex turns{" "}
            <span className="text-muted-foreground/70 line-through decoration-ember-500/60">
              scattered
            </span>{" "}
            knowledge into{" "}
            <span className="text-spark">connected</span> knowledge.
          </h2>
          <Text tone="muted" className="mx-auto max-w-2xl text-base sm:text-lg">
            A single tenant-scoped surface that retrieves, reasons, and
            cites — so the answer comes with the source, every time.
          </Text>
        </div>
      </Container>
    </section>
  )
}
