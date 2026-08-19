/**
 * AuditLogTable — the recent-events table.
 *
 * **F7 Part 5 (Task 5).** One row per
 * audit event returned by
 * `GET /api/v1/audit-log`. The backend
 * returns newest first; the UI preserves
 * that order.
 *
 * **Display rules (per the F7 Part 5 spec).**
 *   - DO display: timestamp, actor
 *     (user / API key / system), action
 *     label, resource (type + short id).
 *   - DO NOT display: tenant_id, raw
 *     `actor_user_id`, raw `actor_api_key_id`,
 *     raw `ip_address`, raw `metadata`
 *     (those go in the detail drawer with
 *     explicit redaction).
 *
 * **Click behaviour.** Clicking a row
 * opens the detail drawer for the event
 * (a right-side panel — see
 * `audit-log-detail.tsx`).
 *
 * **Empty / loading / error states** are
 * owned by the parent panel so the table
 * can assume it has data to render. The
 * table is purely presentational.
 *
 * **Pagination is owned by the parent.**
 * The table renders one page at a time;
 * the panel handles Previous / Next.
 */
"use client"

import { Table, TableBody, TableCell, TableHeader, TableRow } from "@cortex/ui"

import { actionLabel, resourceTypeLabel, shortResourceId, type AuditEvent, type ActorKind } from "@/services/audit"

import { AuditLogActionBadge } from "./audit-log-action-badge"

export interface AuditLogTableProps {
  events: ReadonlyArray<AuditEvent>
  onRowOpen: (eventId: string) => void
}

export function AuditLogTable({ events, onRowOpen }: AuditLogTableProps) {
  return (
    <Table data-testid="audit-log-table">
      <TableHeader>
        <TableRow>
          <TableCell tag="th">Time</TableCell>
          <TableCell tag="th">Actor</TableCell>
          <TableCell tag="th">Action</TableCell>
          <TableCell tag="th">Resource</TableCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => (
          <AuditLogRow key={event.id} event={event} onOpen={onRowOpen} />
        ))}
      </TableBody>
    </Table>
  )
}

function AuditLogRow({
  event,
  onOpen,
}: {
  event: AuditEvent
  onOpen: (eventId: string) => void
}) {
  const kind = actorKindFor(event)
  return (
    <TableRow
      data-testid={`audit-log-row-${event.id}`}
      onClick={() => onOpen(event.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onOpen(event.id)
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`View details for ${actionLabel(event.action)}`}
      className="cursor-pointer transition-colors hover:bg-slate-800/40 focus-visible:bg-slate-800/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt-500"
    >
      <TableCell className="whitespace-nowrap text-xs text-paper-200/70">
        {formatTimestamp(event.created_at)}
      </TableCell>
      <TableCell>
        <ActorCell kind={kind} event={event} />
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-paper-50" data-testid={`audit-log-action-${event.id}`}>
            {actionLabel(event.action)}
          </span>
          <AuditLogActionBadge action={event.action} />
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className="text-sm text-paper-50">
            {resourceTypeLabel(event.resource_type)}
          </span>
          {event.resource_id ? (
            <span className="font-mono text-[10px] uppercase tracking-wider text-paper-200/50">
              {shortResourceId(event.resource_id)}
            </span>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  )
}

function ActorCell({
  kind,
  event,
}: {
  kind: ActorKind
  event: AuditEvent
}) {
  // The backend's `actor_user_id` is a UUID.
  // The UI shows a short prefix so the user
  // can spot *which* actor did the thing
  // without leaking the full id. The detail
  // drawer exposes the full UUID.
  if (kind === "user") {
    const id = event.actor_user_id ?? ""
    return (
      <div className="flex flex-col">
        <span className="text-sm font-medium text-paper-50">User</span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-paper-200/50">
          {shortResourceId(id)}
        </span>
      </div>
    )
  }
  if (kind === "api_key") {
    const id = event.actor_api_key_id ?? ""
    return (
      <div className="flex flex-col">
        <span className="text-sm font-medium text-paper-50">API key</span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-paper-200/50">
          {shortResourceId(id)}
        </span>
      </div>
    )
  }
  return (
    <span className="text-sm text-paper-200/70" data-testid="audit-log-actor-system">
      System
    </span>
  )
}

function actorKindFor(event: Pick<AuditEvent, "actor_user_id" | "actor_api_key_id">): ActorKind {
  if (event.actor_user_id) return "user"
  if (event.actor_api_key_id) return "api_key"
  return "system"
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  // Audit history is meant to answer
  // "When exactly did this happen?" — so we
  // render the *exact* timestamp, not a
  // relative "2 minutes ago". The spec is
  // explicit: "For an audit log, exact
  // timestamps matter more than friendly
  // relative time."
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
