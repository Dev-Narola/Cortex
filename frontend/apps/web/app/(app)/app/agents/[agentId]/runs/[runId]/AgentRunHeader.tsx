"use client"

/**
 * AgentRunHeader — the small banner at the top of
 * the agent run page.
 *
 * Shows the run's input + status + token count.
 * Uses ``useAgentRun`` (the full-run endpoint) so
 * the operator can see the entire run envelope
 * without leaving the page. The trace itself is
 * a separate endpoint (``useAgentToolCalls``);
 * the two are decoupled so the trace can be
 * added incrementally without rewriting the
 * header.
 *
 * **Why a separate component.** Keeps the page
 * itself a server component (the
 * ``defaultExpanded`` prop + the route shape
 * are server-rendered) and isolates the
 * client-side data fetching into a single
 * leaf.
 */

import { useAgentRun } from "@/hooks/agents"

import { Skeleton } from "@cortex/ui"

export interface AgentRunHeaderProps {
  runId: string
  agentId: string
}

export function AgentRunHeader({ runId, agentId }: AgentRunHeaderProps) {
  const query = useAgentRun({ runId })

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-2" data-testid="agent-run-header-loading">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
    )
  }

  if (query.isError) {
    return (
      <div
        className="rounded-md border border-border p-3 text-sm text-muted-foreground"
        data-testid="agent-run-header-error"
        role="alert"
      >
        Run not found or you don't have access.
      </div>
    )
  }

  const run = query.data
  return (
    <header
      className="rounded-md border border-border bg-card/60 p-4"
      data-testid="agent-run-header"
      data-run-status={run.status}
    >
      <div className="flex flex-wrap items-baseline gap-2 text-xs text-muted-foreground">
        <span className="font-medium uppercase tracking-wide">{run.status}</span>
        <span aria-hidden="true">·</span>
        <span>
          {run.iterations} iteration{run.iterations === 1 ? "" : "s"}
        </span>
        <span aria-hidden="true">·</span>
        <span>
          {run.toolCallCount} tool call{run.toolCallCount === 1 ? "" : "s"}
        </span>
        <span aria-hidden="true">·</span>
        <span>
          {run.totalTokens} token{run.totalTokens === 1 ? "" : "s"}
        </span>
        <span aria-hidden="true">·</span>
        <span className="font-mono">{agentId}</span>
      </div>
      <p className="mt-2 text-sm text-foreground">{run.input}</p>
      {run.output ? <p className="mt-2 text-sm text-muted-foreground">{run.output}</p> : null}
    </header>
  )
}
