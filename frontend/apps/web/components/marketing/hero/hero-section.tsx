/**
 * HeroSection — the F8 marketing hero.
 *
 * **F8 Part 1.** The first major marketing
 * moment. This component is the *only*
 * thing on the page for Part 1 (Problem,
 * Solution, features, etc. ship in
 * Parts 2–5).
 *
 * **Composition.**
 *   1. `<HeroBackground />` — ambient
 *      ember + volt radial wash.
 *   2. Headline (Cortex thesis, with the
 *      Spark gradient on the key phrase).
 *   3. Supporting copy.
 *   4. CTA buttons (primary + secondary).
 *   5. `<HeroVisual />` — the node field.
 *
 * **Hero load choreography.** A ~1.4s
 * sequence:
 *
 *   0.00–0.40s  Ambient field appears
 *   0.30–0.90s  Headline reveals word-by-word
 *   0.60–1.00s  Subheadline fades upward
 *   0.90–1.20s  CTA appears
 *   1.20s+      Hero visual enters idle loop
 *
 * The choreography uses GSAP timelines
 * (the spec recommends GSAP for F8
 * because Parts 2–6 need ScrollTrigger).
 * When the user has `prefers-reduced-motion`
 * set, the timeline is bypassed entirely
 * — content appears in its final state
 * immediately. F9 will own the
 * application-wide reduced-motion pass;
 * this module lays the wiring.
 *
 * **Why a single GSAP import.** The
 * marketing site is the GSAP surface
 * (scroll choreography lives there). The
 * F6 KG Explorer stays on R3F; the app
 * shell doesn't use either. Both
 * libraries were already in the
 * dependency tree from earlier work;
 * we're not adding either for F8.
 *
 * **SSR-safe.** GSAP is gated behind
 * `useEffect` so the server render is
 * always the "final state" — the timeline
 * only runs after hydration. The
 * markup is complete on first paint, the
 * motion is purely progressive
 * enhancement.
 */
"use client"

import Link from "next/link"
import { useEffect, useRef } from "react"

import { Button, Container } from "@cortex/ui"

import { MOTION, usePrefersReducedMotion } from "@/lib/marketing/animations"

import { HeroBackground } from "./hero-background"
import { HeroVisual } from "./hero-visual"

const HEADLINE_WORDS = ["scattered", "knowledge,", "connected"] as const

export function HeroSection() {
  const headlineRef = useRef<HTMLHeadingElement>(null)
  const subheadlineRef = useRef<HTMLParagraphElement>(null)
  const ctaRef = useRef<HTMLDivElement>(null)
  const visualRef = useRef<HTMLDivElement>(null)
  const reducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    // Reduced motion → render the final
    // state immediately. No timeline.
    if (reducedMotion) {
      ;[headlineRef.current, subheadlineRef.current, ctaRef.current].forEach(
        (el) => {
          if (!el) return
          el.style.opacity = "1"
          el.style.transform = "none"
        },
      )
      const words = headlineRef.current?.querySelectorAll<HTMLSpanElement>(
        "[data-hero-word]",
      )
      words?.forEach((w) => {
        w.style.opacity = "1"
        w.style.transform = "none"
      })
      return
    }

    // GSAP is dynamically imported so the
    // hero doesn't pull GSAP into the
    // server bundle (and so reduced-motion
    // users never pay the cost).
    let cancelled = false
    void import("gsap").then(({ gsap }) => {
      if (cancelled) return

      const tl = gsap.timeline({
        defaults: { ease: MOTION.easing.out },
      })

      // 0.00–0.40s: ambient field appears.
      tl.fromTo(
        "[data-hero-bg-element]",
        { autoAlpha: 0, scale: 0.96 },
        { autoAlpha: 1, scale: 1, duration: 0.4 },
        0,
      )

      // 0.30–0.90s: headline reveals word-by-word.
      const words = headlineRef.current?.querySelectorAll<HTMLElement>(
        "[data-hero-word]",
      )
      if (words && words.length > 0) {
        tl.fromTo(
          words,
          { autoAlpha: 0, y: 14 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.45,
            stagger: MOTION.headlineStaggerMs / 1000,
          },
          0.3,
        )
      }

      // 0.60–1.00s: subheadline fades upward.
      tl.fromTo(
        subheadlineRef.current,
        { autoAlpha: 0, y: 12 },
        { autoAlpha: 1, y: 0, duration: 0.4 },
        0.6,
      )

      // 0.90–1.20s: CTA appears.
      tl.fromTo(
        ctaRef.current,
        { autoAlpha: 0, y: 8 },
        { autoAlpha: 1, y: 0, duration: 0.3 },
        0.9,
      )

      // 1.20s+: visual fades in. (Idle
      // motion is CSS — see HeroVisual.)
      tl.fromTo(
        visualRef.current,
        { autoAlpha: 0, y: 12 },
        { autoAlpha: 1, y: 0, duration: 0.5 },
        1.0,
      )
    })

    return () => {
      cancelled = true
    }
  }, [reducedMotion])

  return (
    <section
      aria-labelledby="hero-headline"
      className="relative isolate overflow-hidden pb-20 pt-28 md:pb-28 md:pt-36 lg:pt-44"
    >
      <HeroBackground />
      <Container size="lg" className="text-center">
        <p
          data-hero-bg-element
          className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur"
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-spark" />
          v1.0.0 — production-ready
        </p>

        <h1
          ref={headlineRef}
          id="hero-headline"
          className="mx-auto mt-8 max-w-4xl font-display text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl"
        >
          <span className="block">Turn your company&apos;s</span>
          <span className="block">
            {/* The Spark gradient — the single
                "major Spark moment" of the page
                (per the spec: "Only one major
                Spark-gradient moment per page"). */}
            {HEADLINE_WORDS.map((word, i) => (
              <span
                key={word}
                data-hero-word
                className={i === 2 ? "text-spark" : undefined}
                style={{ display: "inline-block", marginRight: "0.25em" }}
              >
                {word}
              </span>
            ))}
          </span>
        </h1>

        <p
          ref={subheadlineRef}
          className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg"
        >
          Hybrid search, a live knowledge graph, and agents that
          reason over your docs — with citations, on every answer.
        </p>

        <div
          ref={ctaRef}
          className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Button asChild size="lg" className="min-w-[180px]">
            <Link href="/register">Start free</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="min-w-[180px]"
          >
            <Link href="/login">Sign in</Link>
          </Button>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          No credit card required · 100 documents free
        </p>

        <div ref={visualRef} className="mt-14 md:mt-20">
          <HeroVisual />
        </div>
      </Container>
    </section>
  )
}
