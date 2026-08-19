/**
 * AuditLogDetail — the side drawer that
 * shows the full payload of a single
 * audit event.
 *
 * **F7 Part 5 (Tasks 13, 14, 18, 19, 34).**
 * Click a row → the drawer slides in from
 * the right (the existing `Drawer` primitive
 * from F1).
 *
 * **What the drawer shows.** Three sections:
 *   1. **Action** — the humanised label +
 *      the raw enum value + the category
 *      badge + the event id.
 *   2. **Actor** — the kind (User / API
 *      key / System) + the relevant UUID
 *      (when present). The UUID is
 *      displayed in JetBrains Mono for
 *      copy-pasting into backend tooling.
 *   3. **Resource** — the humanised type +
 *      the raw id (also in JetBrains Mono).
 *
 * **What the drawer does NOT show.**
 *   - `tenant_id` (the user is already in
 *     their tenant context).
 *   - `ip_address` (per the spec: "Do not
 *     display raw IP address" — this is
 *     sensitive; admin tooling can query
 *     the audit DB directly if needed).
 *   - `metadata` raw. If the backend sends
 *     a metadata blob, the drawer renders
 *     it as a *filtered* subset (no
 *     `password`, `token`, `api_key`,
 *     `secret`, `authorization` fields —
 *     per the F7 Part 5 spec: "Never render
 *     metadata blindly like
 *     JSON.stringify(event.metadata) without
 *     controlling what the backend sends").
 *
 * **Read-only by design.** The drawer has
 * no edit / delete / mutate affordance. The
 * backend audit table is append-only at the
 * repository level; the UI reinforces that
 * by not exposing mutation.
 */
"use client"

import { Badge, Card, CardContent, Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@cortex/ui"

import { actionCategory, actionLabel, categoryLabel, resourceTypeLabel, shortResourceId, type AuditEvent } from "@/services/audit"

import { AuditLogActionBadge } from "./audit-log-action-badge"

interface AuditLogDetailProps {
  event: AuditEvent | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Metadata keys we never display — even if
 *  the backend's metadata blob includes
 *  them. These are the field names the F7
 *  Part 5 spec calls out as "potentially
 *  sensitive" (tokens, credentials, request
 *  bodies, document content, internal stack
 *  traces, PII). We blacklist a defensive
 *  set; a future "show more" toggle can
 *  reveal them behind an explicit admin
 *  action. */
const METADATA_REDACT_KEYS: ReadonlySet<string> = new Set([
  "password",
  "token",
  "access_token",
  "refresh_token",
  "api_key",
  "secret",
  "authorization",
  "bearer",
  "jwt",
  "session_id",
  "cookie",
  "set_cookie",
  "raw_body",
  "request_body",
  "body",
  "stack",
  "stack_trace",
  "traceback",
  "document_content",
])

function safeMetadata(
  metadata: Record<string, unknown> | undefined,
): Array<[string, string]> {
  if (!metadata) return []
  const out: Array<[string, string]> = []
  for (const [k, v] of Object.entries(metadata)) {
    if (METADATA_REDACT_KEYS.has(k.toLowerCase())) continue
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out.push([k, String(v)])
    } else if (v === null) {
      out.push([k, "null"])
    }
  }
  return out
}

export function AuditLogDetail({ event, open, onOpenChange }: AuditLogDetailProps) {
  if (!event) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent side="right" data-testid="audit-log-detail-empty">
          <DrawerHeader>
            <DrawerTitle>Audit event</DrawerTitle>
            <DrawerDescription>No event selected.</DrawerDescription>
          </DrawerHeader>
        </DrawerContent>
      </Drawer>
    )
  }

  const kind = event.actor_user_id ? "user" : event.actor_api_key_id ? "api_key" : "system"
  const meta = safeMetadata(event.metadata)
  const category = actionCategory(event.action)

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        side="right"
        className="w-full sm:max-w-md"
        data-testid={`audit-log-detail-${event.id}`}
      >
        <DrawerHeader>
          <div className="flex items-center justify-between gap-2">
            <DrawerTitle data-testid={`audit-log-detail-title-${event.id}`}>
              {actionLabel(event.action)}
            </DrawerTitle>
            <DrawerClose
              className="text-xs text-paper-200/60 transition-colors hover:text-paper-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt-500"
              data-testid={`audit-log-detail-close-${event.id}`}
            >
              Close
            </DrawerClose>
          </div>
          <DrawerDescription>
            <span className="font-mono text-xs">{event.id}</span>
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <Section title="Action">
            <div className="flex items-center gap-2">
              <AuditLogActionBadge action={event.action} />
              <Badge variant="outline" size="sm">
                {categoryLabel(category)}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-paper-50">{actionLabel(event.action)}</p>
            <p className="font-mono text-xs text-paper-200/60" data-testid={`audit-log-detail-action-${event.id}`}>
              {event.action}
            </p>
          </Section>
          <Section title="Time">
            <p
              className="text-sm text-paper-50"
              data-testid={`audit-log-detail-time-${event.id}`}
            >
              {formatFullTimestamp(event.created_at)}
            </p>
          </Section>
          <Section title="Actor">
            <p className="text-sm font-medium text-paper-50">
              {kind === "user" ? "User" : kind === "api_key" ? "API key" : "System"}
            </p>
            {event.actor_user_id ? (
              <p
                className="mt-1 break-all font-mono text-xs text-paper-200/60"
                data-testid={`audit-log-detail-actor-user-${event.id}`}
              >
                {event.actor_user_id}
              </p>
            ) : event.actor_api_key_id ? (
              <p
                className="mt-1 break-all font-mono text-xs text-paper-200/60"
                data-testid={`audit-log-detail-actor-key-${event.id}`}
              >
                {event.actor_api_key_id}
              </p>
            ) : (
              <p className="mt-1 text-xs text-paper-200/50">
                No actor — the action was performed by the system.
              </p>
            )}
          </Section>
          <Section title="Resource">
            <p className="text-sm text-paper-50">{resourceTypeLabel(event.resource_type)}</p>
            {event.resource_id ? (
              <p
                className="mt-1 break-all font-mono text-xs text-paper-200/60"
                data-testid={`audit-log-detail-resource-${event.id}`}
              >
                {event.resource_id}
              </p>
            ) : (
              <p className="mt-1 text-xs text-paper-200/50">No resource id.</p>
            )}
          </Section>
          {meta.length > 0 ? (
            <Section title="Details">
              <dl
                className="space-y-1"
                data-testid={`audit-log-detail-metadata-${event.id}`}
              >
                {meta.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2 text-xs">
                    <dt className="font-mono text-paper-200/60">{k}</dt>
                    <dd className="text-right text-paper-50">{v}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          ) : null}
          <p className="rounded-md border border-slate-700/40 bg-slate-900/40 p-2 text-[11px] text-paper-200/50">
            Audit events are immutable. This view is read-only; you cannot edit or delete
            the underlying record.
          </p>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-paper-200/60">
          {title}
        </h3>
        {children}
      </CardContent>
    </Card>
  )
}

function formatFullTimestamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

// Re-export the short-id helper so other
// audit components can compose it
// consistently. (Internal — not part of the
// panel's public API.)
export { shortResourceId }
