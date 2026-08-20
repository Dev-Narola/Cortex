/**
 * ProblemSection — the F8 marketing "Problem"
 * beat.
 *
 * **F8 Part 2.** The first beat after the
 * hero. The design philosophy is explicit:
 * **text is the whole point of this beat.**
 * The hero is bold; the problem is *quiet*.
 * No imagery, no animation confetti, no
 * icon — just the scattered-knowledge
 * problem stated plainly.
 *
 * **Why "quiet".** The marketing journey
 * wants a deliberate contrast: hero →
 * problem → solution → features. If the
 * problem section tries to compete with
 * the hero, the page reads as one
 * undifferentiated wall of marketing. The
 * problem section is the visitor's
 * "yes, that's my experience" moment —
 * the words do the work.
 *
 * **Animation.** A restrained fade-up
 * (`opacity: 0 → 1`, `translateY: 16 → 0`)
 * plays once on scroll-in. The spec is
 * explicit: "Avoid word-by-word,
 * paragraph-by-paragraph, icon stagger,
 * background movement. That would violate
 * the design philosophy."
 *
 * **Reduced motion.** The fade-up is
 * skipped entirely; the section lands in
 * its final state on first paint.
 */
"use client"

import { useCallback, useRef } from "react"

import { Container, Text } from "@cortex/ui"

import { useInView } from "@/lib/marketing/animations"

export function ProblemSection() {
  const ref = useRef<HTMLDivElement>(null)
  // The section starts hidden (opacity 0);
  // `onEnter` reveals it via CSS class.
  // This keeps the animation CSS-only so
  // the GSAP bundle isn't pulled into the
  // server.
  const onEnter = useCallback(() => {
    if (ref.current) {
      ref.current.dataset.revealed = "true"
    }
  }, [])
  useInView(ref, onEnter)

  return (
    <section
      id="problem"
      aria-labelledby="problem-heading"
      className="relative py-20 md:py-28"
    >
      <Container size="md" className="text-center">
        <div
          ref={ref}
          data-testid="problem-section"
          className="space-y-6 transition-all duration-[600ms] ease-out opacity-0 translate-y-4 will-change-transform data-[revealed=true]:opacity-100 data-[revealed=true]:translate-y-0"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            The problem
          </p>
          <h2
            id="problem-heading"
            className="font-display text-3xl font-semibold leading-[1.15] tracking-tight text-foreground sm:text-4xl md:text-5xl"
          >
            Your knowledge is everywhere.
            <br className="hidden sm:block" />{" "}
            Answers are nowhere you can trust.
          </h2>
          <Text tone="muted" className="mx-auto max-w-2xl text-base sm:text-lg">
            Documents, notes, wikis, reports, internal knowledge. The
            information is all there — but finding one trustworthy
            answer still means searching through all of it yourself.
          </Text>
        </div>
      </Container>
    </section>
  )
}
