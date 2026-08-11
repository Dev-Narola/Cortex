/**
 * Agent run detail — `/app/agents/{agentId}/runs/{runId}`.
 *
 * **F5 Part 3.** This is the canonical "see the
 * agent trace" surface. The agents list at
 * `/app/agents` (and the future per-agent detail
 * page) will link here. The page renders the
 * ``AgentTrace`` component, which fetches
 * ``GET /api/v1/agents/runs/{runId}/tool-calls``
 * and shows the actual per-tool-call record
 * (tool name, latency, one-line result summary).
 *
 * **Collapsed-by-default on the chat bubble,
 * expanded-by-default here.** The page is the
 * user's destination when they want to inspect a
 * run; the chat bubble is incidental context
 * (the assistant message + the trace are both
 * available, but the trace stays quiet until
 * expanded).
 *
 * **Route params.** The `agentId` is in the URL
 * for URL-shape stability + future "back to
 * agent" links. The trace itself only needs the
 * `runId`; the backend's tenant-scoped endpoint
 * enforces the security boundary.
 *
 * **Loading / error.** The page is a client
 * component (the trace is interactive). The
 * outer chrome is a server-friendly shell so
 * the page is statically shapeable; the trace
 * itself owns the request lifecycle.
 */

import Link from "next/link"

import { ChevronLeft, ExternalLink } from "lucide-react"
import type { Route } from "next"

import { AgentTrace } from "@/components/chat/agents"
import { AgentRunHeader } from "./AgentRunHeader"

interface PageProps {
  /**
   * Next.js 15 delivers dynamic segment
   * params as a Promise. The route is a
   * Server Component; awaiting the promise
   * at the top of the handler is the
   * recommended pattern.
   */
  params: Promise<{
    agentId: string
    runId: string
  }>
}

export default async function AgentRunPage({ params }: PageProps) {
  const { agentId, runId } = await params
  return (
    <div
      className="mx-auto flex max-w-3xl flex-col gap-4"
      data-testid="agent-run-page"
    >
      <div className="flex items-center gap-2 text-sm text-[var(--text-muted,#9ca3af)]">
        <Link
          href={
            `/app/agents/${encodeURIComponent(agentId)}` as Route
          }
          className="inline-flex items-center gap-1 hover:text-[var(--text,#e5e7eb)]"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to agent
        </Link>
        <span aria-hidden="true">·</span>
        <a
          href={`/api/v1/agents/runs/${encodeURIComponent(runId)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 hover:text-[var(--text,#e5e7eb)]"
        >
          Raw run JSON
          <ExternalLink
            className="h-3 w-3"
            aria-hidden="true"
          />
        </a>
      </div>

      <AgentRunHeader runId={runId} agentId={agentId} />

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted,#9ca3af)]">
          Tool-call trace
        </h2>
        <AgentTrace runId={runId} defaultExpanded />
      </section>
    </div>
  )
}
