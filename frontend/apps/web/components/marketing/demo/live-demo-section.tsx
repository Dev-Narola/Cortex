/**
 * LiveDemoSection — the F8 marketing
 * "Live Demo" beat.
 *
 * **F8 Part 4.** The highest-value section
 * of the marketing page (per the F8 spec:
 * "the live demo is the single
 * highest-value animated moment on the
 * site"). The visitor picks a question,
 * watches Cortex answer in real time,
 * then clicks a citation to see the source.
 *
 * **Composition.** A section with:
 *   - Eyebrow ("See it work")
 *   - Heading + supporting copy
 *   - The `<DemoChat />` card (the
 *     centered Cloud-background card
 *     per the F8 spec)
 *
 * **Card width.** A comfortable reading
 * width (max-w-3xl ≈ 768px — within the
 * F8 spec's "900–1000px" range). Not
 * full-viewport — the card should read
 * as "this is the product", not "this is
 * another full-width section".
 *
 * **Background.** The card uses the
 * `Cloud` palette (light marketing
 * surface). The surrounding section
 * uses a subtle gradient wash so the
 * card reads as elevated, not as floating
 * on a flat canvas.
 *
 * **Reduced motion.** The card itself is
 * static; the only motion is the streaming
 * simulation + caret blink, both gated by
 * the `motion-safe:` Tailwind variant and
 * the global reduced-motion CSS rule.
 */
"use client"

import { Container } from "@cortex/ui"

import { DemoChat } from "./demo-chat"

export function LiveDemoSection() {
  return (
    <section
      id="demo"
      aria-labelledby="live-demo-heading"
      className="relative border-t border-border/60 bg-background/30 py-20 md:py-28"
    >
      {/* Soft section background so the
          card reads as elevated. Pure
          CSS, no JS. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse at top, oklch(0.95 0.04 50 / 0.4), transparent 65%), radial-gradient(ellipse at bottom right, oklch(0.95 0.05 145 / 0.3), transparent 65%)",
        }}
      />
      <Container size="md" className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          See it work
        </p>
        <h2
          id="live-demo-heading"
          className="mt-3 font-display text-3xl font-semibold leading-[1.15] tracking-tight text-foreground sm:text-4xl md:text-5xl"
        >
          Ask Cortex a real question.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
          Pick an example below — or type your own. Watch the
          answer stream in, then click a citation to see the
          source behind it.
        </p>
        <div className="mx-auto mt-10 max-w-3xl text-left">
          <DemoChat />
        </div>
      </Container>
    </section>
  )
}
