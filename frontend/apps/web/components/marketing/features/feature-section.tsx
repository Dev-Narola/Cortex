/**
 * FeatureSection — the reusable wrapper
 * for the F8 feature beats.
 *
 * **F8 Part 2 + 3.** The four feature beats
 * (Hybrid Search, Knowledge Graph, Agents +
 * MCP, Citations) all share the same
 * structural shell:
 *
 *   ┌─────────────┬─────────────┐
 *   │ text        │  visual     │
 *   │             │             │
 *   │ icon        │  (the part   │
 *   │ eyebrow     │   that      │
 *   │ heading     │   explains) │
 *   │ description │             │
 *   └─────────────┴─────────────┘
 *
 * with the text/visual order alternating
 * (so the page reads as a rhythm, not
 * four identical cards). The `reverse`
 * prop drives the swap:
 *
 *   false → [text] [visual]   (default)
 *   true  → [visual] [text]
 *
 * **Icon.** F8 Part 3 added an optional
 * `icon` prop. The marketing feature icons
 * use the Spark gradient treatment
 * (per the F8 spec: "The four marketing
 * feature icons should use the Spark
 * gradient, while normal application
 * icons remain Lucide"). The icon is a
 * small Spark-filled circle in the
 * top-left of the text column.
 *
 * **Why a reusable wrapper, not four
 * bespoke sections.** The F8 spec is
 * explicit: "Design it so the later
 * sections can reuse it. ... Don't
 * over-engineer it. The purpose is to
 * ensure all four feature sections share
 * structural consistency while still
 * having different visual behavior." A
 * wrapper + a custom visual per feature
 * is the right balance.
 *
 * **Animation ownership.** The text
 * column owns its own `useInView` + fade-
 * up. The visual column is owned by the
 * feature itself (it might do a merge
 * animation, a node-draw, a trace, etc.
 * — each feature knows what it needs).
 * Centralising the "play once on scroll-
 * in" semantic in `useInView` means
 * every feature does the right thing
 * without per-feature animation code.
 */
"use client"

import { useCallback, useRef, type ReactNode } from "react"

import { Container, Text } from "@cortex/ui"

import { useInView } from "@/lib/marketing/animations"

interface FeatureSectionProps {
  /** Stable section id (used by the marketing nav). */
  id: string
  /** Small label above the heading (e.g. "Hybrid Search"). */
  eyebrow: string
  /** h2 heading. */
  title: string
  /** Supporting paragraph. */
  description: ReactNode
  /** The technical visual. The visual is
   *  expected to:
   *  - be `aria-hidden` (decorative)
   *  - use the `useInView` hook from
   *    `lib/marketing/animations` to
   *    play its animation once on
   *    scroll-in. */
  visual: ReactNode
  /** Optional icon. F8 Part 3 added this
   *  for the four feature beats. The
   *  marketing feature icons use the
   *  Spark gradient (per the F8 spec);
   *  the wrapper renders the icon in
   *  a small Spark-filled circle. */
  icon?: ReactNode
  /** When true, the visual appears on the LEFT, text on the right. */
  reverse?: boolean
}

export function FeatureSection({
  id,
  eyebrow,
  title,
  description,
  visual,
  icon,
  reverse = false,
}: FeatureSectionProps) {
  const textRef = useRef<HTMLDivElement>(null)
  const onEnter = useCallback(() => {
    if (textRef.current) {
      textRef.current.dataset.revealed = "true"
    }
  }, [])
  useInView(textRef, onEnter)

  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="relative py-20 md:py-28"
    >
      <Container size="lg">
        <div
          className={`grid gap-10 md:gap-14 lg:gap-20 md:grid-cols-2 md:items-center ${
            reverse ? "md:[&>*:first-child]:order-2" : ""
          }`}
        >
          <div
            ref={textRef}
            data-testid={`${id}-text`}
            className="space-y-5 transition-all duration-[600ms] ease-out opacity-0 translate-y-4 will-change-transform data-[revealed=true]:opacity-100 data-[revealed=true]:translate-y-0"
          >
            {icon ? (
              <div
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-spark text-paper-50 shadow-spark"
                aria-hidden
                data-testid={`${id}-icon`}
              >
                {icon}
              </div>
            ) : null}
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {eyebrow}
            </p>
            <h2
              id={`${id}-heading`}
              className="font-display text-3xl font-semibold leading-[1.15] tracking-tight text-foreground sm:text-4xl md:text-5xl"
            >
              {title}
            </h2>
            <Text tone="muted" className="max-w-xl text-base sm:text-lg">
              {description}
            </Text>
          </div>
          <div data-testid={`${id}-visual-slot`}>{visual}</div>
        </div>
      </Container>
    </section>
  )
}
