/**
 * Dashboard — `/app`.
 *
 * The first thing the user sees after login. Three high-signal
 * tiles: document count, recent agent runs, usage this month.
 * Implemented as a query against `@cortex/api-client` + TanStack
 * Query once the codegen has run; the placeholders are
 * intentionally loose until then.
 */
export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Welcome back
        </h1>
        <p className="text-sm text-muted-foreground">
          Here&apos;s what&apos;s happening across your knowledge base.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <DashboardTile
          label="Documents"
          value="—"
          hint="Total documents in your tenant"
        />
        <DashboardTile
          label="Agent runs (24h)"
          value="—"
          hint="Across all agents"
        />
        <DashboardTile
          label="Storage used"
          value="—"
          hint="Documents + chunks + embeddings"
        />
      </div>
    </div>
  );
}

function DashboardTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-6">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}
