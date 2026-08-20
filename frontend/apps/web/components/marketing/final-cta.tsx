/**
 * FinalCTA — the F8 marketing "Final CTA"
 * beat.
 *
 * **F8 Part 5.** The visitor has now seen:
 *
 *   Hero → Problem → Solution → 4 feature
 *   beats → Live Demo → Technical Strip
 *
 * The page is no longer trying to explain
 * or prove. It's asking the visitor to
 * act. The CTA section is therefore
 * deliberately a *calmer* version of the
 * hero — no Spark gradient headline, no
 * animated ambient background, no word-by-
 * word reveal.
 *
 * **Motion philosophy.** A single fade-up
 * on scroll-in. The CTA itself lands
 * without the hero's 1.4s timeline. The
 * spec is explicit: "quieter motion than
 * the hero ... confident, not desperate."
 *
 * **One primary CTA.** The spec is also
 * explicit: don't drop a "Get Started +
 * Book a Demo + Talk to Sales + GitHub"
 * button forest on the page. One primary
 * button, one supporting link, both
 * pointing to the real auth flow.
 *
 * **CTA destination.** The primary CTA
 * routes to `/register` (the existing
 * F2-built signup flow). The secondary
 * "Talk to your data" link points to
 * `/login` for users who already have a
 * workspace. No marketing-only
 * onboarding is invented here.
 *
 * **Visual.** A subdued section (Mist
 * text, light background, no Spark
 * gradient on the headline) so the
 * Spark-gradient final button is the
 * single visual accent in the section —
 * which matches the spec: "a restrained
 * Spark accent can be used for the
 * button".
 */
"use client"

import Link from "next/link"
import { useCallback, useRef } from "react"

import { Button, Container, Text } from "@cortex/ui"

import { useInView } from "@/lib/marketing/animations"

export function FinalCTA() {
  const ref = useRef<HTMLDivElement>(null)
  const onEnter = useCallback(() => {
    if (ref.current) {
      ref.current.dataset.revealed = "true"
    }
  }, [])
  useInView(ref, onEnter)

  return (
    <section
      aria-labelledby="final-cta-heading"
      data-testid="final-cta"
      className="relative border-t border-border/60 bg-background py-20 md:py-28"
    >
      <Container size="md" className="text-center">
        <div
          ref={ref}
          data-testid="final-cta-content"
          className="mx-auto max-w-2xl space-y-6 transition-all duration-[600ms] ease-out opacity-0 translate-y-4 will-change-transform data-[revealed=true]:opacity-100 data-[revealed=true]:translate-y-0"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Ready when you are
          </p>
          <h2
            id="final-cta-heading"
            className="font-display text-3xl font-semibold leading-[1.15] tracking-tight text-foreground sm:text-4xl md:text-5xl"
          >
            Ready to work with your knowledge?
          </h2>
          <Text tone="muted" className="mx-auto max-w-xl text-base sm:text-lg">
            Cortex takes a few minutes to set up. Bring a folder, get a searchable, citable,
            graph-backed answer engine — and only pay for what your team actually uses.
          </Text>

          {/*
            Single primary CTA + a quieter
            secondary link to /login (for
            users who already have an account).
            The spec is explicit: "Only one
            primary CTA" — so the secondary
            is a plain text link, not a
            second button.
          */}
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
            <Button asChild size="lg" className="min-w-[200px]">
              <Link href="/register">Get started free</Link>
            </Button>
            <Link
              href="/login"
              className="text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
            >
              I already have a workspace
            </Link>
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            No credit card required · 100 documents free
          </p>
        </div>
      </Container>
    </section>
  )
}
