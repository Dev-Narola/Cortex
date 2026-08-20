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
 * **F8 Part 4.** The Live Demo section
 * joins the marketing page. The complete
 * core story is now:
 *
 *   Hero → Problem → Solution →
 *   Hybrid Search → Knowledge Graph →
 *   Agents + MCP → Citations → LIVE DEMO
 *
 * The F2 carryover (features grid, "how it
 * works", final CTA, footer) stays below
 * the fold for the same reasons as in
 * F8 P1 + P2.
 *
 * **Auth check.** We read the
 * `cortex_auth_hint` cookie (the same
 * hint the edge middleware uses) and
 * redirect to the dashboard if the user
 * has a session.
 */

import type { Metadata } from "next"
import { cookies } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"

import { Button, Container, Heading, Text } from "@cortex/ui"

import {
  AgentsMcpSection,
  CitationsSection,
  HeroSection,
  HybridSearchSection,
  KnowledgeGraphSection,
  LiveDemoSection,
  MarketingHeader,
  ProblemSection,
  SolutionSection,
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
        {/* F8 Part 1 — the hero. */}
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

        {/* ─── F2 carryover — F8 Part 5+ will replace ────── */}
        <section className="border-t border-border bg-background/40 py-16 md:py-24">
          <Container size="lg">
            <div className="mx-auto max-w-2xl text-center">
              <Heading level="h2" size="lg">
                One platform. Every answer.
              </Heading>
              <Text tone="muted" className="mt-3">
                Cortex combines retrieval, reasoning, and action in a
                single tenant-scoped surface.
              </Text>
            </div>

            <div className="mt-12 grid gap-6 md:grid-cols-3">
              <FeatureCard
                title="Hybrid search"
                body="BM25 + dense vector search, fused with reciprocal-rank. Cites its sources, every time."
              />
              <FeatureCard
                title="Knowledge graph"
                body="Cortex extracts entities and edges as you upload. Browse the graph, query it, watch it grow."
              />
              <FeatureCard
                title="Agents + MCP"
                body="Multi-step tool-calling agents that talk to your stack via the Model Context Protocol."
              />
              <FeatureCard
                title="Tenant-isolated"
                body="Every query is scoped. Every embedding is namespaced. Multi-tenant by design, not by accident."
              />
              <FeatureCard
                title="Bring your own model"
                body="OpenAI, Anthropic, or self-hosted Ollama. Cortex is provider-agnostic — your keys, your cost."
              />
              <FeatureCard
                title="Audit + observability"
                body="Every request is traceable. Every answer is reproducible. OpenTelemetry out of the box."
              />
            </div>
          </Container>
        </section>

        <section className="py-16 md:py-24">
          <Container size="md">
            <div className="mx-auto max-w-2xl text-center">
              <Heading level="h2" size="lg">
                Up and running in three steps.
              </Heading>
            </div>
            <ol className="mx-auto mt-12 grid max-w-3xl gap-6 md:grid-cols-3">
              <Step n={1} title="Create your workspace" body="One workspace per team, per customer, per project. Pick a slug, you're in." />
              <Step n={2} title="Upload your knowledge" body="PDF, Markdown, plain text. Cortex chunks, embeds, and indexes automatically." />
              <Step n={3} title="Ask anything" body="Search, chat, build agents. Answers cite their sources, every time." />
            </ol>
          </Container>
        </section>

        <section className="border-t border-border bg-background/40 py-16 md:py-24">
          <Container size="md" className="text-center">
            <Heading level="h2" size="lg">
              Your knowledge deserves a brain.
            </Heading>
            <Text tone="muted" className="mx-auto mt-3 max-w-xl">
              Join the teams already running their private knowledge on
              Cortex. Free to start, painless to scale.
            </Text>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="min-w-[180px]">
                <Link href="/register">Start free</Link>
              </Button>
              <Button asChild size="lg" variant="ghost" className="min-w-[180px]">
                <Link href="/pricing">See pricing</Link>
              </Button>
            </div>
          </Container>
        </section>

        <footer className="border-t border-border py-10">
          <Container size="lg" className="flex flex-col items-center justify-between gap-4 text-sm text-muted-foreground md:flex-row">
            <div className="flex items-center gap-2">
              <span className="font-display text-base font-semibold text-spark">Cortex</span>
              <span>© {new Date().getFullYear()}</span>
            </div>
            <nav className="flex items-center gap-6">
              <Link href="/pricing" className="hover:text-foreground">
                Pricing
              </Link>
              <Link href="/login" className="hover:text-foreground">
                Sign in
              </Link>
              <Link href="/register" className="hover:text-foreground">
                Sign up
              </Link>
            </nav>
          </Container>
        </footer>
      </main>
    </>
  )
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="group rounded-xl border border-border bg-background p-6 transition-shadow hover:shadow-md">
      <Heading level="h3" size="sm" className="font-display">
        {title}
      </Heading>
      <Text size="sm" tone="muted" className="mt-2">
        {body}
      </Text>
    </div>
  )
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="relative rounded-xl border border-border bg-background p-6">
      <span className="absolute -top-3 left-6 inline-flex h-6 w-6 items-center justify-center rounded-full bg-spark font-display text-xs font-semibold text-paper-50 shadow-spark">
        {n}
      </span>
      <Heading level="h3" size="sm" className="mt-1 font-display">
        {title}
      </Heading>
      <Text size="sm" tone="muted" className="mt-2">
        {body}
      </Text>
    </li>
  )
}
