/**
 * Audit hooks — barrel export.
 *
 * F7 Part 5. Every audit hook the rest of
 * the app needs to import lives here.
 */

export { auditKeys } from "./auditKeys"
export {
  useAuditLog,
  type UseAuditLogParams,
  type UseAuditLogResult,
} from "./useAuditLog"
