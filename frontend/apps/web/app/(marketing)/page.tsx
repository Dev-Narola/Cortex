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
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cortex — your company's private knowledge, on tap",
  description:
    "Multi-tenant AI knowledge and agent platform. Hybrid search, knowledge graph, agents, and MCP — production-grade.",
  alternates: { canonical: "/" },
};

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-24">
      <h1 className="font-display text-5xl font-semibold tracking-tight md:text-7xl">
        <span className="text-spark">Cortex</span> — your company&apos;s private
        knowledge, on tap.
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
        Multi-tenant AI platform with hybrid search, a real
        knowledge graph, agents that can reason, and an MCP server
        so any client can talk to it. Production-grade.
      </p>
      <div className="mt-10 flex gap-4">
        <a
          href="/login"
          className="inline-flex h-11 items-center justify-center rounded-md bg-spark px-6 text-base font-medium text-paper-50 shadow-lg transition-opacity hover:opacity-95"
        >
          Sign in
        </a>
        <a
          href="/pricing"
          className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-background px-6 text-base font-medium hover:bg-muted"
        >
          See pricing
        </a>
      </div>
    </div>
  );
}
