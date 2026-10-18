/**
 * DashboardView — workspace overview as a bento grid.
 *
 * Every number is read from the backend:
 *   documents      GET /documents (total, and per-status totals via ?status=)
 *   conversations  GET /conversations (total + latest five)
 *   usage          GET /tenants/me/usage/summary (month to date, backend default)
 *   activity       GET /audit-log (owner/admin only; hidden for other roles)
 *   health         GET /health/ready (measured round-trip, not a claim)
 * Loading shows skeletons; a failed request says "Unavailable" for that card
 * only. A workspace with no documents gets the upload call-to-action first.
 */

"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import type { ReactNode } from "react"

import { Button, Card, Icon, Skeleton } from "@cortex/ui"

import { MetricCard } from "@/components/dashboard/MetricCard"
import { DocumentStatusBadge } from "@/components/documents/DocumentStatusBadge"
import { useAuditLog } from "@/hooks/audit"
import { useConversations } from "@/hooks/chat"
import { useDocuments } from "@/hooks/documents"
import { useTenantUsageSummary } from "@/hooks/usage"
import { checkHealth } from "@/lib/api/health"
import { useAuthStore } from "@/lib/auth/store"
import { formatRelative } from "@/lib/utils/date"

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 })
const usd = new Intl.NumberFormat("en", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})

function Panel({
  title,
  action,
  className = "",
  children,
}: {
  title: string
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <Card variant="glass" radius="xl" padding="none" className={`flex flex-col ${className}`}>
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
        <h2 className="font-display text-base font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      <div className="flex-1 px-2 pb-2">{children}</div>
    </Card>
  )
}

function RowsSkeleton() {
  return (
    <output className="space-y-2 px-3 py-2" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} size="h-9 w-full" />
      ))}
    </output>
  )
}

function Unavailable({ what }: { what: string }) {
  return (
    <p className="px-3 py-6 text-sm text-muted-foreground">
      Couldn't load {what}. Refresh to try again.
    </p>
  )
}

export function DashboardView() {
  const user = useAuthStore((s) => s.user)
  const tenant = useAuthStore((s) => s.tenant)
  const isAdmin = user?.role === "owner" || user?.role === "admin"
  const workspaceName = tenant?.workspace ?? tenant?.slug ?? "your workspace"

  // Exact counts: `?status=` narrows `total`, so limit=1 is enough.
  const docs = useDocuments({ limit: 5 })
  const indexedQ = useDocuments({ limit: 1, status: "indexed" })
  const failedQ = useDocuments({ limit: 1, status: "failed" })
  const conversations = useConversations({ limit: 5 })
  const usage = useTenantUsageSummary()
  const audit = useAuditLog({ limit: 6, enabled: isAdmin })
  const health = useQuery({
    queryKey: ["health", "ready"],
    queryFn: ({ signal }) => checkHealth({ signal }),
    refetchInterval: 60_000,
  })

  const total = docs.data?.total
  const indexed = indexedQ.data?.total
  const failed = failedQ.data?.total
  const counts = total !== undefined && indexed !== undefined && failed !== undefined
  const countsLoading = docs.isLoading || indexedQ.isLoading || failedQ.isLoading
  const countsError = docs.isError || indexedQ.isError || failedQ.isError
  const empty = total === 0
  const tokens = usage.data
    ? usage.data.embedding_tokens +
      usage.data.completion_input_tokens +
      usage.data.completion_output_tokens
    : 0

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{workspaceName}</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            Overview
          </h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={"/app/documents?upload=1" as never}>
              <Icon name="Upload" className="h-4 w-4" aria-hidden />
              Upload
            </Link>
          </Button>
          <Button asChild>
            <Link href="/chat">
              <Icon name="Sparkles" className="h-4 w-4" aria-hidden />
              Ask Cortex
            </Link>
          </Button>
        </div>
      </header>

      {empty ? (
        <Card variant="glass" radius="2xl" className="relative overflow-hidden p-8 sm:p-10">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-brand/15 blur-3xl"
          />
          <div className="relative max-w-xl space-y-3">
            <h2 className="font-display text-2xl font-semibold text-foreground">
              Add your first document
            </h2>
            <p className="text-muted-foreground">
              Upload a PDF, Markdown or text file, or import a web page. Cortex parses, chunks and
              embeds it, and answers questions with citations back to the source.
            </p>
            <Button asChild size="lg" className="mt-2">
              <Link href={"/app/documents?upload=1" as never}>Upload a document</Link>
            </Button>
          </div>
        </Card>
      ) : null}

      <section
        aria-label="Key metrics"
        className="stagger-rise grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          label="Documents"
          icon="FileText"
          href="/app/documents"
          loading={docs.isLoading}
          error={docs.isError}
          value={total !== undefined ? compact.format(total) : null}
          hint={
            indexed !== undefined ? `${compact.format(indexed)} indexed and searchable` : undefined
          }
        />
        <MetricCard
          label="Processing"
          icon="LoaderCircle"
          tone={failed ? "warning" : "info"}
          loading={countsLoading}
          error={countsError}
          value={counts ? compact.format(total - indexed - failed) : null}
          hint={
            failed !== undefined
              ? failed > 0
                ? `${failed} failed, retry from Documents`
                : "No failures"
              : undefined
          }
        />
        <MetricCard
          label="Conversations"
          icon="MessageSquare"
          tone="ai"
          href="/chat"
          loading={conversations.isLoading}
          error={conversations.isError}
          value={conversations.data ? compact.format(conversations.data.total) : null}
        />
        <MetricCard
          label="Requests, month to date"
          icon="Activity"
          tone="info"
          href="/app/settings/usage"
          loading={usage.isLoading}
          error={usage.isError}
          value={usage.data ? compact.format(usage.data.requests) : null}
          hint={
            usage.data
              ? `${compact.format(tokens)} tokens · ${usd.format(usage.data.estimated_cost_usd)} estimated`
              : undefined
          }
        />
      </section>

      <div className="stagger-rise grid gap-4 lg:grid-cols-12">
        <Panel
          title="Recent documents"
          className="lg:col-span-7"
          action={
            <Link href="/app/documents" className="text-sm text-brand hover:underline">
              View all
            </Link>
          }
        >
          {docs.isLoading ? (
            <RowsSkeleton />
          ) : docs.isError ? (
            <Unavailable what="documents" />
          ) : docs.data && docs.data.items.length > 0 ? (
            <ul className="divide-y divide-divider">
              {docs.data.items.map((d) => (
                <li key={d.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5">
                  <Icon name="FileText" className="h-4 w-4 shrink-0 text-faint" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground" title={d.title}>
                    {d.title}
                  </span>
                  <DocumentStatusBadge status={d.status} />
                  <span className="hidden w-24 shrink-0 text-right text-xs text-faint sm:block">
                    {formatRelative(d.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-6 text-sm text-muted-foreground">No documents yet.</p>
          )}
        </Panel>

        <Panel title="System" className="lg:col-span-5">
          <dl className="space-y-1 px-3 py-1">
            <div className="flex items-center justify-between py-2">
              <dt className="text-sm text-muted-foreground">API</dt>
              <dd className="flex items-center gap-2 text-sm">
                {health.isLoading ? (
                  <Skeleton size="h-4 w-24" />
                ) : health.data?.kind === "healthy" ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
                    <span className="text-foreground">Ready</span>
                    <span className="tabular text-faint">{health.data.latencyMs} ms</span>
                  </>
                ) : health.data?.kind === "degraded" ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-warning" aria-hidden />
                    <span className="text-foreground">Degraded</span>
                  </>
                ) : (
                  <>
                    <span className="h-2 w-2 rounded-full bg-error" aria-hidden />
                    <span className="text-foreground">Unreachable</span>
                  </>
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between border-t border-divider py-2">
              <dt className="text-sm text-muted-foreground">Indexed documents</dt>
              <dd className="tabular text-sm text-foreground">
                {indexed !== undefined ? (
                  indexed
                ) : indexedQ.isError ? (
                  "—"
                ) : (
                  <Skeleton size="h-4 w-8" />
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between border-t border-divider py-2">
              <dt className="text-sm text-muted-foreground">Rerank units, month to date</dt>
              <dd className="tabular text-sm text-foreground">
                {usage.data ? (
                  compact.format(usage.data.rerank_units)
                ) : usage.isError ? (
                  "—"
                ) : (
                  <Skeleton size="h-4 w-8" />
                )}
              </dd>
            </div>
          </dl>
          <p className="px-3 pt-1 pb-2 text-xs text-faint">
            Checked every minute from your browser.
          </p>
        </Panel>

        <Panel
          title="Recent conversations"
          className={isAdmin ? "lg:col-span-6" : "lg:col-span-12"}
          action={
            <Link href="/chat" className="text-sm text-brand hover:underline">
              Open chat
            </Link>
          }
        >
          {conversations.isLoading ? (
            <RowsSkeleton />
          ) : conversations.isError ? (
            <Unavailable what="conversations" />
          ) : conversations.data && conversations.data.items.length > 0 ? (
            <ul className="divide-y divide-divider">
              {conversations.data.items.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/chat/${c.id}` as never}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon
                      name="MessageSquare"
                      className="h-4 w-4 shrink-0 text-faint"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {c.title || "Untitled"}
                    </span>
                    <span className="shrink-0 text-xs text-faint">
                      {formatRelative(c.updatedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-6 text-sm text-muted-foreground">
              No conversations yet.{" "}
              <Link href="/chat" className="text-brand hover:underline">
                Ask your first question
              </Link>
            </p>
          )}
        </Panel>

        {isAdmin ? (
          <Panel
            title="Recent activity"
            className="lg:col-span-6"
            action={
              <Link href="/app/settings/audit-log" className="text-sm text-brand hover:underline">
                Audit log
              </Link>
            }
          >
            {audit.isLoading ? (
              <RowsSkeleton />
            ) : audit.isError ? (
              <Unavailable what="activity" />
            ) : audit.data && audit.data.items.length > 0 ? (
              <ul className="divide-y divide-divider">
                {audit.data.items.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-2" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                      {e.action}
                    </span>
                    <span className="shrink-0 text-xs text-faint">
                      {formatRelative(e.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 py-6 text-sm text-muted-foreground">No activity recorded yet.</p>
            )}
          </Panel>
        ) : null}
      </div>
    </div>
  )
}
