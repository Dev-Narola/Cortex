/**
 * AuditLogFilters — the filter row above
 * the audit log table.
 *
 * **F7 Part 5 (Tasks 15-25).** Server-side
 * filters only — no client-side filtering
 * over a paginated dataset (per the spec:
 * "Do not create client-side filters over
 * a paginated dataset and give the
 * impression that the entire audit history
 * was searched").
 *
 * **Supported filters.** Three:
 *   - **Action** — dropdown of the
 *     closed-set `AUDIT_ACTIONS` enum
 *     (grouped by `actionCategory`).
 *   - **Resource type** — dropdown of the
 *     closed-set `AUDIT_RESOURCE_TYPES`
 *     enum.
 *   - **Date range** — two `input[type=date]`
 *     fields (`from` + `to`).
 *
 * **Why no actor filter.** The backend's
 * `actor_user_id` filter is a UUID. The UI
 * doesn't have an "actor picker" today and
 * building one is out of scope. The detail
 * drawer exposes the actor UUID for
 * cross-referencing with the backend
 * admin tools.
 *
 * **State management.** Filter values are
 * local UI state (the spec is explicit:
 * "Use local UI state for filter
 * controls"). The parent panel lifts the
 * state up so it can drive both the query
 * AND the "Clear filters" affordance.
 *
 * **No `tenant_id` filter.** The route is
 * tenant-scoped; the backend resolves the
 * tenant from the authenticated JWT.
 */
"use client"

import { useId } from "react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@cortex/ui"

import {
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
  actionCategory,
  actionLabel,
  resourceTypeLabel,
  type ActionCategory,
} from "@/services/audit"

export interface AuditLogFiltersValue {
  action?: string
  resource_type?: string
  /** Inclusive lower bound (ISO 8601 date —
   *  the `<input type="date">` returns
   *  `YYYY-MM-DD`). */
  start_date?: string
  /** Exclusive upper bound (ISO 8601 date). */
  end_date?: string
}

interface AuditLogFiltersProps {
  value: AuditLogFiltersValue
  onChange: (next: AuditLogFiltersValue) => void
  disabled?: boolean
}

/**
 * Radix's `Select` rejects empty-string
 * values (it reserves `""` for "clear the
 * selection and show the placeholder"). We
 * use a non-empty sentinel for the "All"
 * option so the filter clear path works
 * the same way as the spec requires.
 */
const ALL_FILTER = "__all__"

type ActionOption = { value: string; label: string; category: ActionCategory }

const ACTION_OPTIONS: ReadonlyArray<ActionOption> = (() => {
  // Group the closed-set enum by category,
  // then alphabetical within each group.
  // The result is a stable, user-friendly
  // dropdown that mirrors the action
  // category colour in the row.
  const byCategory = new Map<ActionCategory, string[]>()
  for (const a of Object.values(AUDIT_ACTIONS)) {
    const cat = actionCategory(a)
    if (!byCategory.has(cat)) byCategory.set(cat, [])
    byCategory.get(cat)!.push(a)
  }
  const order: ActionCategory[] = [
    "documents",
    "api_keys",
    "users",
    "tenant",
    "conversations",
    "auth",
    "other",
  ]
  const out: ActionOption[] = []
  for (const cat of order) {
    const actions = byCategory.get(cat)
    if (!actions || actions.length === 0) continue
    for (const a of [...actions].sort()) {
      // Use the same canonical labels as
      // `actionLabel` so the dropdown and
      // the rendered row never disagree.
      out.push({ value: a, label: actionLabel(a), category: cat })
    }
  }
  return out
})()

const RESOURCE_OPTIONS: ReadonlyArray<{ value: string; label: string }> =
  Object.values(AUDIT_RESOURCE_TYPES)
    .sort()
    .map((v) => ({ value: v, label: resourceTypeLabel(v) }))

export function AuditLogFilters({ value, onChange, disabled }: AuditLogFiltersProps) {
  const actionId = useId()
  const resourceId = useId()
  const fromId = useId()
  const toId = useId()
  const hasAnyFilter =
    value.action !== undefined ||
    value.resource_type !== undefined ||
    value.start_date !== undefined ||
    value.end_date !== undefined

  return (
    <div
      data-testid="audit-log-filters"
      aria-label="Audit log filters"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <div className="flex flex-col gap-1">
        <label
          htmlFor={actionId}
          className="text-xs font-medium uppercase tracking-wider text-paper-200/60"
        >
          Action
        </label>
        <Select
          value={value.action ?? ALL_FILTER}
          onValueChange={(v: string) =>
            onChange({ ...value, ...(v === ALL_FILTER ? { action: undefined } : { action: v }) })
          }
          disabled={disabled}
        >
          <SelectTrigger id={actionId} data-testid="audit-log-filter-action">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER}>All actions</SelectItem>
            {ACTION_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <label
          htmlFor={resourceId}
          className="text-xs font-medium uppercase tracking-wider text-paper-200/60"
        >
          Resource
        </label>
        <Select
          value={value.resource_type ?? ALL_FILTER}
          onValueChange={(v: string) =>
            onChange({
              ...value,
              ...(v === ALL_FILTER ? { resource_type: undefined } : { resource_type: v }),
            })
          }
          disabled={disabled}
        >
          <SelectTrigger id={resourceId} data-testid="audit-log-filter-resource">
            <SelectValue placeholder="All resources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER}>All resources</SelectItem>
            {RESOURCE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <label
          htmlFor={fromId}
          className="text-xs font-medium uppercase tracking-wider text-paper-200/60"
        >
          From
        </label>
        <input
          id={fromId}
          type="date"
          value={value.start_date ?? ""}
          onChange={(e) =>
            onChange({
              ...value,
              ...(e.target.value ? { start_date: e.target.value } : { start_date: undefined }),
            })
          }
          disabled={disabled}
          data-testid="audit-log-filter-from"
          className="h-10 rounded-md border border-slate-700/60 bg-slate-900/60 px-3 text-sm text-paper-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt-500"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label
          htmlFor={toId}
          className="text-xs font-medium uppercase tracking-wider text-paper-200/60"
        >
          To
        </label>
        <input
          id={toId}
          type="date"
          value={value.end_date ?? ""}
          onChange={(e) =>
            onChange({
              ...value,
              ...(e.target.value ? { end_date: e.target.value } : { end_date: undefined }),
            })
          }
          disabled={disabled}
          data-testid="audit-log-filter-to"
          className="h-10 rounded-md border border-slate-700/60 bg-slate-900/60 px-3 text-sm text-paper-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt-500"
        />
      </div>
      {hasAnyFilter ? (
        <div className="col-span-full flex justify-end">
          <button
            type="button"
            onClick={() => onChange({})}
            disabled={disabled}
            data-testid="audit-log-filter-clear"
            className="text-xs font-medium text-volt-400 transition-colors hover:text-volt-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear filters
          </button>
        </div>
      ) : null}
    </div>
  )
}
