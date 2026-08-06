/**
 * Marketing landing — `/`.
 *
 * **Server-rendered, ISR-friendly.** A clean, conversion-focused
 * landing page that:
 *   - Redirects already-authed users to `/app/dashboard` at the
 *     server level (so the redirect happens in a single round-trip,
 *     no client flicker).
 *   - Renders the public hero + features + CTA for everyone else.
 *
 * **No business logic.** The page is presentational. The CTA
 * buttons are plain `<Link>`s to `/login` + `/register`; the
 * `(marketing)` layout owns the light theme + chrome.
 *
 * **Auth check.** We read the `cortex_auth_hint` cookie (the same
 * hint the edge middleware uses) and redirect to the dashboard if
 * the user has a session. The cookie is a presence hint, not a
 * security boundary — the real auth check is the api-client's
 * 401-handler on the dashboard.
 */

import type { Metadata } from "next"
import { cookies } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"

import { Button, Container, Heading, Text } from "@cortex/ui"

export const metadata: Metadata = {
  title: "Cortex — your company's private knowledge, on tap",
  description:
    "Multi-tenant AI knowledge and agent platform. Hybrid search, knowledge graph, agents, and MCP — production-grade.",
  alternates: { canonical: "/" },
}

export const dynamic = "force-dynamic"

export default async function LandingPage() {
  // Server-side auth check — bounce signed-in users to the
  // dashboard before we even render. The `cortex_auth_hint`
  // cookie is the same presence hint the edge middleware uses.
  const cookieStore = await cookies()
  const hint = cookieStore.get("cortex_auth_hint")
  if (hint?.value === "1") {
    redirect("/app/dashboard")
  }

  return (
    <>
      {/* ─── Hero ───────────────────────────────────────────────── */}
      <section className="relative overflow-hidden py-20 md:py-28">
        {/* Subtle gradient backdrop. Pure CSS — no JS. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,theme(colors.ember.100),transparent_60%),radial-gradient(ellipse_at_bottom_right,theme(colors.volt.100),transparent_55%)]"
        />
        <Container size="lg" className="text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
            v1.0.0 — production-ready
          </div>
          <Heading
            level="h1"
            className="mx-auto mt-6 max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl lg:text-7xl"
          >
            <span className="text-spark">Cortex</span>
            <span className="block text-foreground">
              your company&apos;s private knowledge, on tap.
            </span>
          </Heading>
          <Text size="lg" tone="muted" className="mx-auto mt-6 max-w-2xl">
            Multi-tenant AI platform with hybrid search, a live knowledge
            graph, and intelligent agents. Production-grade, self-hostable,
            yours.
          </Text>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="min-w-[180px]">
              <Link href="/register">Start free</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="min-w-[180px]">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
          <Text size="xs" tone="muted" className="mt-4">
            No credit card required · 100 documents free
          </Text>
        </Container>
      </section>

      {/* ─── Features ───────────────────────────────────────────── */}
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

      {/* ─── How it works ───────────────────────────────────────── */}
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

      {/* ─── Final CTA ──────────────────────────────────────────── */}
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

      {/* ─── Footer ─────────────────────────────────────────────── */}
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
