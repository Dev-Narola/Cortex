/**
 * Marketing landing page — `/`.
 *
 * Stage 0–2 of the UX doc: this is the SEO surface. The hero
 * orchestrates the multi-stage entrance (ambient fade → word
 * mask-wipe → subhead → CTA) via GSAP. ScrollTrigger handles
 * the section beats.
 *
 * Static rendering + ISR (revalidate every 5 min) keeps the
 * meta-description fresh without re-deploying.
 */
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Cortex — your company's private knowledge, on tap",
  description:
    "Multi-tenant AI knowledge and agent platform. Hybrid search, knowledge graph, agents, and MCP — production-grade.",
  alternates: { canonical: "/" },
}

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-32 text-center md:py-44">
      <h1 className="font-display text-5xl font-semibold tracking-tight md:text-7xl">
        <span className="text-spark">Cortex</span> — your company&apos;s private knowledge, on tap.
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
        Multi-tenant AI platform with hybrid search, knowledge graph, and intelligent agents.
        Production-grade.
      </p>
      <div className="mt-10 flex justify-center">
        <a
          href="/register"
          className="inline-flex h-12 items-center justify-center rounded-md bg-spark px-8 text-base font-medium text-paper-50 shadow-lg transition-opacity hover:opacity-95"
        >
          Sign Up
        </a>
      </div>
    </main>
  )
}
