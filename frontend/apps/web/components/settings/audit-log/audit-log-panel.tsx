/**
 * AuditLogPanel — the Settings → Audit Log
 * screen.
 *
 * **F7 Part 5.** The composition root for
 * the Audit tab. It owns:
 *   - The page header (title + subtitle).
 *   - The filter row (`<AuditLogFilters>`).
 *   - The audit table (or the loading /
 *     empty / error / forbidden state).
 *   - The Previous / Next pagination
 *     controls.
 *   - The detail drawer (one open at a
 *     time, dismiss with the Esc key or
 *     the close button).
 *
 * **Read-only by construction.** The panel
 * does NOT call `delete`, `patch`, or
 * `put` on the audit endpoint. The backend
 * is append-only at the repository level;
 * the UI reinforces that by exposing only
 * the read path.
 *
 * **Pagination model.** Keyset (cursor)
 * pagination over `(created_at desc,
 * id desc)`. The cursor is opaque base64;
 * the panel is a pass-through. We keep a
 * small history stack of visited cursors
 * so Previous works without a `back()`
 * round-trip to the server.
 *
 * **Filter → query key.** Changing a
 * filter resets the cursor stack (so
 * Previous doesn't return the user to a
 * page that's no longer in the filter
 * scope). The query key includes the
 * filter set, so the cache is also
 * partitioned correctly.
 *
 * **Permission boundary.** The backend
 * returns 403 for member/viewer; the
 * SettingsTabs in the parent layout
 * hides the tab for those roles. If a
 * member/viewer lands here directly
 * (e.g. bookmarked URL), the panel
 * surfaces a friendly "unauthorized"
 * state instead of a generic 500.
 */
"use client"

import { useCallback, useMemo, useState } from "react"

import { Button, Card, CardContent, ErrorState, Icon, Skeleton } from "@cortex/ui"

import { useAuditLog } from "@/hooks/audit"
import type { AuditEvent, AuditEventListResponse } from "@/services/audit"

import { AuditLogDetail } from "./audit-log-detail"
import { AuditLogFilters, type AuditLogFiltersValue } from "./audit-log-filters"
import { AuditLogTable } from "./audit-log-table"

const DEFAULT_PAGE_SIZE = 50

interface PageCursor {
  /** The cursor to send for the *previous*
   *  page. `null` means "no previous page"
   *  (we're on the first page). */
  prev: string | null
  /** The cursor we used to fetch the
   *  *current* page. `null` for the first
   *  page. */
  current: string | null
  /** The cursor to send for the *next*
   *  page. `null` when the backend didn't
   *  return a `next_cursor`. */
  next: string | null
}

export function AuditLogPanel() {
  const [filters, setFilters] = useState<AuditLogFiltersValue>({})
  // The cursor stack is a list of
  // `{current}` values for each page we've
  // visited. Index 0 is the first page.
  // We expose the last entry as "current"
  // and the one before as "prev"; the
  // "next" is whatever the last response
  // returned.
  const [cursorStack, setCursorStack] = useState<ReadonlyArray<string | null>>([])
  // The currently-open detail event id.
  const [openEventId, setOpenEventId] = useState<string | null>(null)

  // Changing any filter resets the
  // pagination stack — otherwise
  // Previous could land the user on a
  // page that no longer matches the
  // current filter set.
  const onFiltersChange = useCallback((next: AuditLogFiltersValue) => {
    setFilters(next)
    setCursorStack([])
    setOpenEventId(null)
  }, [])

  const currentCursor: string | null =
    cursorStack.length === 0 ? null : cursorStack[cursorStack.length - 1] ?? null

  const { data, isLoading, isError, error, refetch, isFetching } = useAuditLog({
    limit: DEFAULT_PAGE_SIZE,
    ...(currentCursor !== null ? { cursor: currentCursor } : {}),
    ...(filters.action !== undefined ? { action: filters.action } : {}),
    ...(filters.resource_type !== undefined
      ? { resource_type: filters.resource_type }
      : {}),
    ...(filters.start_date !== undefined ? { start_date: filters.start_date } : {}),
    ...(filters.end_date !== undefined ? { end_date: filters.end_date } : {}),
  })

  // Permission gate — the backend returns
  // 403 for member/viewer. We surface that
  // explicitly rather than as a generic
  // 500. (The SettingsTabs in the parent
  // layout already hides the tab for these
  // roles; this branch only fires on direct
  // URL navigation.)
  const isForbidden = useMemo(() => {
    if (!isError) return false
    const e = error as { status?: number } | null
    return e?.status === 403
  }, [isError, error])

  // The detail drawer pulls the event
  // out of the latest loaded page. (The
  // page boundary doesn't apply — once an
  // event is on screen, opening its detail
  // should always work.)
  const openEvent = useMemo<AuditEvent | null>(() => {
    if (!openEventId || !data) return null
    return data.items.find((e) => e.id === openEventId) ?? null
  }, [openEventId, data])

  const cursor = useMemo<PageCursor>(() => {
    const previousCursors = cursorStack.slice(0, -1)
    // `noUncheckedIndexedAccess` widens the
    // indexed access to `T | undefined` —
    // we already checked the length above,
    // so the `?? null` is a defensive
    // narrowing.
    const prevEntry = previousCursors[previousCursors.length - 1] ?? null
    return {
      prev: prevEntry,
      current: currentCursor,
      next: data?.next_cursor ?? null,
    }
  }, [cursorStack, currentCursor, data])

  const goPrev = useCallback(() => {
    if (cursorStack.length <= 1) {
      setCursorStack([])
    } else {
      setCursorStack(cursorStack.slice(0, -1))
    }
    setOpenEventId(null)
  }, [cursorStack])

  const goNext = useCallback(() => {
    if (!data?.next_cursor) return
    setCursorStack([...cursorStack, data.next_cursor])
    setOpenEventId(null)
  }, [cursorStack, data])

  return (
    <div
      className="space-y-6"
      data-testid="audit-log-panel"
      aria-label="Audit log"
    >
      <header className="space-y-1">
        <h2 className="font-display text-base font-semibold tracking-tight">
          Audit Log
        </h2>
        <p className="text-sm text-paper-200/70">
          Review activity and changes made in this workspace.
        </p>
        <p className="text-xs text-paper-200/50">
          Append-only. Workspace events recorded by Cortex — you can&rsquo;t edit or
          delete them.
        </p>
      </header>

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <AuditLogFilters
            value={filters}
            onChange={onFiltersChange}
            disabled={isLoading || isFetching}
          />
        </CardContent>
      </Card>

      {isLoading ? (
        <AuditLogSkeleton />
      ) : isForbidden ? (
        <AuditLogForbiddenState />
      ) : isError ? (
        <ErrorState
          title="Unable to load the audit log."
          description="We couldn't reach the audit service. Check your connection and try again."
          retryLabel="Retry"
          onRetry={() => {
            void refetch()
          }}
          code={
            error && "status" in error
              ? String((error as { status?: number }).status ?? "")
              : undefined
          }
        />
      ) : data ? (
        <AuditLogBody
          data={data}
          onRowOpen={setOpenEventId}
          cursor={cursor}
          onPrev={goPrev}
          onNext={goNext}
        />
      ) : (
        <AuditLogSkeleton />
      )}

      <AuditLogDetail
        event={openEvent}
        open={openEventId !== null}
        onOpenChange={(o) => {
          if (!o) setOpenEventId(null)
        }}
      />
    </div>
  )
}

function AuditLogBody({
  data,
  onRowOpen,
  cursor,
  onPrev,
  onNext,
}: {
  data: AuditEventListResponse
  onRowOpen: (id: string) => void
  cursor: PageCursor
  onPrev: () => void
  onNext: () => void
}) {
  if (data.items.length === 0) {
    return <AuditLogEmptyState />
  }
  const totalLoaded = data.items.length
  return (
    <div className="space-y-3" data-testid="audit-log-body">
      <AuditLogTable events={data.items} onRowOpen={onRowOpen} />
      <div
        className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between"
        data-testid="audit-log-pagination"
      >
        <p className="text-xs text-paper-200/60">
          Showing the most recent {totalLoaded} event{totalLoaded === 1 ? "" : "s"} for
          this page.
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onPrev}
            disabled={cursor.prev === null}
            data-testid="audit-log-pagination-prev"
          >
            <Icon name="ArrowLeft" size="sm" aria-hidden />
            <span>Previous</span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onNext}
            disabled={cursor.next === null}
            data-testid="audit-log-pagination-next"
          >
            <span>Next</span>
            <Icon name="ArrowRight" size="sm" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  )
}

function AuditLogEmptyState() {
  return (
    <Card data-testid="audit-log-empty">
      <CardContent className="space-y-2 p-4 sm:p-6 text-center">
        <div
          aria-hidden
          className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-800/60 text-paper-200/60"
        >
          <Icon name="ScrollText" className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium text-paper-50">No activity yet</p>
        <p className="mx-auto max-w-sm text-sm text-paper-200/70">
          Workspace activity will appear here as documents, users, API keys, and other
          workspace actions occur.
        </p>
      </CardContent>
    </Card>
  )
}

function AuditLogForbiddenState() {
  return (
    <Card data-testid="audit-log-forbidden">
      <CardContent className="space-y-2 p-4 sm:p-6 text-center">
        <div
          aria-hidden
          className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-800/60 text-paper-200/60"
        >
          <Icon name="Lock" className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium text-paper-50">
          You don&rsquo;t have access to the audit log
        </p>
        <p className="mx-auto max-w-sm text-sm text-paper-200/70">
          Only workspace owners and admins can review the audit trail. Ask an admin to
          grant you access if you need it.
        </p>
      </CardContent>
    </Card>
  )
}

function AuditLogSkeleton() {
  return (
    <output
      data-testid="audit-log-skeleton"
      aria-label="Loading audit log"
      className="block"
    >
      <div className="space-y-2 rounded-md border border-slate-700/40 bg-slate-900/30 p-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>
    </output>
  )
}
