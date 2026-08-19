/**
 * AuditLogActionBadge — subtle category pill
 * for a single audit event row.
 *
 * **F7 Part 5 (Task 33).** Audit information
 * should feel "precise, stable, trustworthy,
 * dense but readable" (per the F7 Part 5
 * spec). The badge is *deliberately quiet*:
 * the action text is the primary
 * information; the badge is a secondary
 * category hint at small sizes.
 *
 * **What the badge is NOT.** Not a "success
 * / error" indicator. Audit events record
 * facts; whether a login was a `LOGIN_SUCCESS`
 * or a `LOGIN_FAILURE` is shown in the
 * action text, not the badge color. The
 * category only groups events by surface
 * area (Documents / API keys / Users /
 * etc.) so the user can scan the table
 * quickly.
 */
import { Badge, type BadgeVariantProps } from "@cortex/ui"

import { actionCategory, type ActionCategory } from "@/services/audit"

import { categoryLabel } from "@/services/audit"

const CATEGORY_VARIANT: Record<ActionCategory, NonNullable<BadgeVariantProps["variant"]>> = {
  documents: "secondary",
  api_keys: "secondary",
  users: "secondary",
  tenant: "secondary",
  conversations: "secondary",
  auth: "secondary",
  other: "outline",
}

export function AuditLogActionBadge({ action }: { action: string }) {
  const category = actionCategory(action)
  return (
    <Badge
      variant={CATEGORY_VARIANT[category]}
      size="sm"
      data-testid={`audit-log-category-${category}`}
    >
      {categoryLabel(category)}
    </Badge>
  )
}
