/**
 * Audit Log — `/app/settings/audit-log`.
 *
 * **F7 Part 5.** Thin route that mounts
 * `<AuditLogPanel />` — same pattern as the
 * other F7 Settings pages.
 *
 * **RBAC.** Owner/admin only. The backend
 * returns 403 for member/viewer; the
 * SettingsTabs in the parent layout hides
 * the tab for those roles. The panel
 * surfaces a friendly "forbidden" state
 * for the direct-URL case.
 */
import { AuditLogPanel } from "@/components/settings/audit-log/audit-log-panel"

export default function AuditLogPage() {
  return <AuditLogPanel />
}
