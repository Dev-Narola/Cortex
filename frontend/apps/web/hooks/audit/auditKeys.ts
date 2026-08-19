/**
 * Audit log query keys — the single source of truth.
 *
 * **F7 Part 5.** Same pattern as F6's
 * `kgKeys`, F7 P1's `teamKeys`, F7 P2's
 * `apiKeyKeys`, F7 P3's `mcpKeys`, F7 P4's
 * `usageKeys`. Hierarchical keys so the
 * panel can invalidate one page or all in a
 * single call.
 *
 * **The pattern.**
 *   - `auditKeys.all`                  → every audit query
 *   - `auditKeys.list({...})`          → a single page of events
 *   - `auditKeys.detail(id)`           → a single event detail
 *
 * The list key is a factory that takes the
 * same params the service takes (cursor +
 * limit + filters). The query layer uses
 * the same identity to dedupe in-flight
 * requests and to invalidate by filter
 * subset.
 */
import type { GetAuditLogParams } from "@/services/audit"

export const auditKeys = {
  all: ["audit-log"] as const,
  lists: () => [...auditKeys.all, "list"] as const,
  list: (params?: Omit<GetAuditLogParams, "signal">) =>
    [...auditKeys.lists(), params ?? {}] as const,
  details: () => [...auditKeys.all, "detail"] as const,
  detail: (id: string) => [...auditKeys.details(), id] as const,
}
