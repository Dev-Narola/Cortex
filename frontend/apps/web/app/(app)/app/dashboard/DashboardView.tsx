/**
 * DashboardView — the workspace overview, as a bento grid.
 *
 * The primary task (asking Cortex) leads: a wide hero with the Ask bar.
 * Around it, smaller cards answer "what's in my knowledge base, what did I
 * do recently, what is it costing". Every number comes from the backend:
 * document counts use `?status=` totals, usage is the month-to-date summary,
 * health is a live readiness probe. Each card loads and fails on its own;
 * a failed source reads "Unavailable", never zero.
 */

"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import type { ReactNode } from "react"

import { Button, Card, Icon, type IconName, Skeleton, cn } from "@cortex/ui"

import { AskBar } from "@/components/dashboard/AskBar"
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
  icon,
  action,
  className = "",
  children,
}: {
  title: string
  icon?: IconName
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <Card radius="xl" padding="none" className={cn("flex flex-col", className)}>
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
        <h2 className="flex items-center gap-2 font-display text-[0.9375rem] font-semibold text-foreground">
          {icon ? <Icon name={icon} className="h-4 w-4 text-faint" aria-hidden /> : null}
          {title}
        </h2>
        {action}
      </div>
      <div className="flex-1 px-2 pb-2">{children}</div>
    </Card>
  )
}

function PanelLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href as never}
      className="rounded-full px-2 py-0.5 text-xs font-medium text-brand-ink transition-colors hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </Link>
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

/** One stacked bar of real proportions; segments with a zero value are omitted. */
function ProportionBar({
  label,
  segments,
}: {
  label: string
  segments: { key: string; value: number; className: string }[]
}) {
  const total = segments.reduce((n, s) => n + s.value, 0)
  if (total === 0) return <div className="h-2 rounded-full bg-muted" aria-hidden />
  return (
    <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={label}>
      {segments
        .filter((s) => s.value > 0)
        .map((s) => (
          <span
            key={s.key}
            className={cn("h-full rounded-full", s.className)}
            style={{ width: `${(s.value / total) * 100}%` }}
          />
        ))}
    </div>
  )
}

function Legend({ items }: { items: { label: string; value: ReactNode; dot: string }[] }) {
  return (
    <dl className="grid grid-cols-3 gap-2">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn("h-2 w-2 shrink-0 rounded-full", i.dot)} aria-hidden />
            <span className="truncate">{i.label}</span>
          </dt>
          <dd className="tabular mt-0.5 text-sm font-medium text-foreground">{i.value}</dd>
        </div>
      ))}
    </dl>
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
  const processing = counts ? Math.max(0, total - indexed - failed) : undefined
  const countsLoading = docs.isLoading || indexedQ.isLoading || failedQ.isLoading
  const countsError = docs.isError || indexedQ.isError || failedQ.isError
  const empty = total === 0
  const u = usage.data
  const tokens = u ? u.embedding_tokens + u.completion_input_tokens + u.completion_output_tokens : 0

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{workspaceName}</p>
        <h1 className="font-display text-[1.75rem] font-medium leading-tight tracking-[-0.02em] text-foreground sm:text-[2.125rem]">
          Overview
        </h1>
      </header>

      <div className="stagger-rise grid gap-4 lg:grid-cols-12">
        {/* Hero: the primary task. */}
        <section
          aria-labelledby="ask-heading"
          className="relative overflow-hidden rounded-3xl border border-brand-border bg-brand-soft p-6 sm:p-8 lg:col-span-8"
        >
          <div className="relative flex h-full flex-col justify-between gap-8">
            <div className="max-w-xl space-y-2">
              <p className="text-sm font-medium text-brand-ink">Ask Cortex</p>
              <h2
                id="ask-heading"
                className="font-display text-[1.75rem] font-medium leading-[1.15] tracking-[-0.025em] text-foreground sm:text-[2.25rem]"
              >
                What do you want to know?
              </h2>
              <p className="text-sm text-muted-foreground sm:text-[0.9375rem]">
                Answers are grounded in your indexed documents, with a citation for every claim.
              </p>
            </div>
            <AskBar
              hint={
                indexed === 0
                  ? "No document is indexed yet, so answers won't have sources. Upload one first."
                  : undefined
              }
            />
          </div>
        </section>

        {/* Knowledge base status. */}
        <Card radius="xl" className="flex flex-col gap-5 p-5 lg:col-span-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-[0.9375rem] font-semibold text-foreground">
              <Icon name="FileText" className="h-4 w-4 text-faint" aria-hidden />
              Documents
            </h2>
            <PanelLink href="/app/documents">Manage</PanelLink>
          </div>
          <div aria-live="polite">
            {countsLoading ? (
              <Skeleton size="h-10 w-24" />
            ) : docs.isError ? (
              <p className="text-sm text-muted-foreground">Unavailable</p>
            ) : (
              <p className="tabular font-display text-5xl font-medium tracking-[-0.03em] text-foreground">
                {total !== undefined ? compact.format(total) : "—"}
              </p>
            )}
            {indexed !== undefined && !countsLoading ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {`${compact.format(indexed)} indexed and searchable`}
              </p>
            ) : null}
          </div>
          {counts && !countsError ? (
            <div className="mt-auto space-y-3">
              <ProportionBar
                label={`${indexed} indexed, ${processing} processing, ${failed} failed`}
                segments={[
                  { key: "indexed", value: indexed, className: "bg-success" },
                  { key: "processing", value: processing ?? 0, className: "bg-brand" },
                  { key: "failed", value: failed, className: "bg-error" },
                ]}
              />
              <Legend
                items={[
                  { label: "Indexed", value: compact.format(indexed), dot: "bg-success" },
                  {
                    label: "Processing",
                    value: compact.format(processing ?? 0),
                    dot: "bg-brand",
                  },
                  { label: "Failed", value: compact.format(failed), dot: "bg-error" },
                ]}
              />
              <p className="text-xs text-faint">
                {failed > 0 ? `${failed} failed, retry from Documents` : "No failures"}
              </p>
            </div>
          ) : countsError ? (
            <p className="mt-auto text-sm text-muted-foreground">Unavailable</p>
          ) : null}
          <Button variant="outline" size="sm" asChild className="self-start">
            <Link href={"/app/documents?upload=1" as never}>
              <Icon name="Upload" aria-hidden />
              Upload
            </Link>
          </Button>
        </Card>

        {empty ? (
          <Card radius="xl" className="p-6 lg:col-span-12">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-xl space-y-1">
                <h2 className="font-display text-xl font-medium text-foreground">
                  Add your first document
                </h2>
                <p className="text-sm text-muted-foreground">
                  Upload a PDF, Markdown or text file, or import a web page. Cortex parses, chunks
                  and embeds it, then answers questions with citations back to the source.
                </p>
              </div>
              <Button asChild>
                <Link href={"/app/documents?upload=1" as never}>Upload a document</Link>
              </Button>
            </div>
          </Card>
        ) : null}

        <Panel
          title="Recent conversations"
          icon="MessageSquare"
          className="lg:col-span-5"
          action={<PanelLink href="/chat">Open chat</PanelLink>}
        >
          {conversations.isLoading ? (
            <RowsSkeleton />
          ) : conversations.isError ? (
            <Unavailable what="conversations" />
          ) : conversations.data && conversations.data.items.length > 0 ? (
            <ul>
              {conversations.data.items.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/chat/${c.id}` as never}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
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
              No conversations yet. Ask your first question above.
            </p>
          )}
        </Panel>

        <Panel
          title="Recent documents"
          icon="Files"
          className="lg:col-span-4"
          action={<PanelLink href="/app/documents">View all</PanelLink>}
        >
          {docs.isLoading ? (
            <RowsSkeleton />
          ) : docs.isError ? (
            <Unavailable what="documents" />
          ) : docs.data && docs.data.items.length > 0 ? (
            <ul>
              {docs.data.items.map((d) => (
                <li key={d.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground" title={d.title}>
                    {d.title}
                  </span>
                  <DocumentStatusBadge status={d.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-6 text-sm text-muted-foreground">No documents yet.</p>
          )}
        </Panel>

        {/* Month-to-date usage with the real token mix. */}
        <Card radius="xl" className="flex flex-col gap-4 p-5 lg:col-span-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-[0.9375rem] font-semibold text-foreground">
              <Icon name="Activity" className="h-4 w-4 text-faint" aria-hidden />
              This month
            </h2>
            <PanelLink href="/app/settings/usage">Usage</PanelLink>
          </div>
          {usage.isLoading ? (
            <Skeleton size="h-16 w-full" />
          ) : usage.isError || !u ? (
            <p className="text-sm text-muted-foreground">Unavailable</p>
          ) : (
            <>
              <div>
                <p className="tabular font-display text-3xl font-medium tracking-[-0.02em] text-foreground">
                  {compact.format(u.requests)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  requests · {`${usd.format(u.estimated_cost_usd)} estimated`}
                </p>
              </div>
              <div className="mt-auto space-y-2.5">
                <ProportionBar
                  label={`Token mix: ${u.embedding_tokens} embedding, ${u.completion_input_tokens} prompt, ${u.completion_output_tokens} output`}
                  segments={[
                    { key: "emb", value: u.embedding_tokens, className: "bg-chart-2" },
                    { key: "in", value: u.completion_input_tokens, className: "bg-chart-1" },
                    { key: "out", value: u.completion_output_tokens, className: "bg-chart-3" },
                  ]}
                />
                <p className="text-xs text-muted-foreground">
                  <span className="tabular font-medium text-foreground">
                    {compact.format(tokens)}
                  </span>{" "}
                  tokens: <span className="text-chart-2">●</span> embed{" "}
                  <span className="text-chart-1">●</span> prompt{" "}
                  <span className="text-chart-3">●</span> output
                </p>
              </div>
            </>
          )}
        </Card>

        {isAdmin ? (
          <Panel
            title="Recent activity"
            icon="ScrollText"
            className="lg:col-span-8"
            action={<PanelLink href="/app/settings/audit-log">Audit log</PanelLink>}
          >
            {audit.isLoading ? (
              <RowsSkeleton />
            ) : audit.isError ? (
              <Unavailable what="activity" />
            ) : audit.data && audit.data.items.length > 0 ? (
              <ul className="grid gap-x-4 sm:grid-cols-2">
                {audit.data.items.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
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

        <Card
          radius="xl"
          className={cn("flex flex-col gap-3 p-5", isAdmin ? "lg:col-span-4" : "lg:col-span-12")}
        >
          <h2 className="flex items-center gap-2 font-display text-[0.9375rem] font-semibold text-foreground">
            <Icon name="Gauge" className="h-4 w-4 text-faint" aria-hidden />
            System
          </h2>
          <dl className="divide-y divide-divider text-sm">
            <div className="flex items-center justify-between py-2">
              <dt className="text-muted-foreground">API</dt>
              <dd className="flex items-center gap-2">
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
            <div className="flex items-center justify-between py-2">
              <dt className="text-muted-foreground">Rerank units, month to date</dt>
              <dd className="tabular text-foreground">
                {u ? (
                  compact.format(u.rerank_units)
                ) : usage.isError ? (
                  "—"
                ) : (
                  <Skeleton size="h-4 w-8" />
                )}
              </dd>
            </div>
          </dl>
          <p className="mt-auto text-xs text-faint">Checked every minute from your browser.</p>
        </Card>
      </div>
    </div>
  )
}
