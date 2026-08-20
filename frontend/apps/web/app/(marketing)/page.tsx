/**
 * Marketing landing — `/`.
 *
 * **Server-rendered, ISR-friendly.** A
 * clean, conversion-focused landing page
 * that:
 *   - Redirects already-authed users to
 *     `/app/dashboard` at the server level.
 *   - Renders the public marketing story
 *     for everyone else.
 *
 * **F8 — final composition.** With Part 5
 * landed, the complete F8 story is:
 *
 *   Hero → Problem → Solution →
 *   Hybrid Search → Knowledge Graph →
 *   Agents + MCP → Citations → Live Demo →
 *   Technical Credibility → Final CTA →
 *   Footer
 *
 * The F2 carryover (features grid, "how
 * it works", mid-CTA, footer) is now
 * fully replaced. F8 is the canonical
 * marketing story end-to-end.
 *
 * **Auth check.** We read the
 * `cortex_auth_hint` cookie (the same
 * hint the edge middleware uses) and
 * redirect to the dashboard if the user
 * has a session.
 *
 * **Thin page.** This file only declares
 * the order of sections. The actual copy,
 * animation, layout, and section spacing
 * live in each section's component — the
 * page is the narrative outline, not a
 * kitchen sink.
 */

import type { Metadata } from "next"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import {
  AgentsMcpSection,
  CitationsSection,
  FinalCTA,
  Footer,
  HeroSection,
  HybridSearchSection,
  KnowledgeGraphSection,
  LiveDemoSection,
  MarketingHeader,
  ProblemSection,
  SolutionSection,
  TechnicalCredibility,
} from "@/components/marketing"

export const metadata: Metadata = {
  title: "Cortex — your company's private knowledge, on tap",
  description:
    "Multi-tenant AI knowledge and agent platform. Hybrid search, knowledge graph, agents, and MCP — production-grade.",
  alternates: { canonical: "/" },
}

export const dynamic = "force-dynamic"

export default async function LandingPage() {
  // Server-side auth check — bounce signed-in users to the
  // dashboard before we even render.
  const cookieStore = await cookies()
  const hint = cookieStore.get("cortex_auth_hint")
  if (hint?.value === "1") {
    redirect("/app/dashboard")
  }

  return (
    <>
      <MarketingHeader />
      <main id="main">
        {/* F8 Part 1 — the hero. `id="product"`
            is the marketing nav's "Product"
            anchor. */}
        <HeroSection />

        {/* F8 Part 2 — problem → solution → first feature. */}
        <ProblemSection />
        <SolutionSection />
        <HybridSearchSection />

        {/* F8 Part 3 — the remaining 3 feature beats. */}
        <KnowledgeGraphSection />
        <AgentsMcpSection />
        <CitationsSection />

        {/* F8 Part 4 — the live interactive demo. */}
        <LiveDemoSection />

        {/* F8 Part 5 — the closing trio. */}
        <TechnicalCredibility />
        <FinalCTA />
      </main>
      <Footer />
    </>
  )
}
