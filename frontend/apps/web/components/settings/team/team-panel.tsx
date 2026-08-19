/**
 * TeamPanel — the Settings → Team screen.
 *
 * **F7 Part 1 (Tasks 12, 15-19, 21-24, 27-36).**
 * The composition root for the Team tab. It owns:
 *   - the panel header (title + invite button)
 *   - the member list (table or empty state)
 *   - the loading + error + retry path
 *   - the invite modal (open / close / submit)
 *   - the permission-aware invite action
 *
 * **Why this lives in `components/settings/team/`** —
 * the panel is the unit of reuse. A future "Switch
 * workspace → Team" modal can render the same panel
 * without dragging the route along.
 *
 * **Permission model.** Per RBAC ADR-0004: only
 * `owner` + `admin` can invite. The PRD says
 * "Don't merely disable the button. The UI
 * specification says permission boundaries should
 * prevent inappropriate controls from rendering."
 * So the Invite button is hidden — not disabled —
 * for `member` / `viewer`. The role is read from
 * the existing `useAuthStore` (the source of truth
 * the rest of the app uses for "who is the current
 * user").
 *
 * **Backend gap (Part 1G).** The backend doesn't
 * yet expose `GET /users` or `POST /users/invite`
 * (verified against `Cortex/src/identity/interface/rest/routes.py`).
 * The service layer is wired to the expected
 * endpoints; when they land the panel lights up
 * automatically. The 404 / network-failure paths
 * render the existing `ErrorState` primitive with
 * a Retry button. **No mocked data, no fake rows.**
 */
"use client"

import { useCallback, useState } from "react"

import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  Icon,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@cortex/ui"

import { useTeamMembers } from "@/hooks/team"
import { useAuthStore } from "@/lib/auth/store"
import type { TeamMember, TeamMemberRole } from "@/services/team"

import { InviteMemberModal } from "./invite-member-modal"

/**
 * Roles that can invite. Mirrors the backend's
 * authorization check (the backend will 403 anyone
 * else; the UI gate is a UX layer, not a security
 * boundary — RBAC ADR-0004 makes the backend the
 * source of truth).
 */
const INVITER_ROLES: ReadonlyArray<TeamMemberRole> = ["owner", "admin"] as const

/**
 * Resolve a role → Badge tone. The map is
 * deliberately narrow — every visible role must
 * appear here, with no fallback to a default.
 *
 *   owner  → accent (Ember; "this person can break things")
 *   admin  → info    (Volt; can configure)
 *   member → default (Paper-50; standard)
 *   viewer → muted   (Slate; read-only)
 */
function roleBadgeTone(role: TeamMemberRole): "default" | "secondary" {
  switch (role) {
    case "owner":
      return "default"
    case "admin":
      return "secondary"
    case "member":
    case "viewer":
      return "secondary"
  }
}

function roleLabel(role: TeamMemberRole): string {
  // Title-case the role for the UI. The backend
  // returns the lower-case enum value; the table
  // displays the friendly form.
  return role.charAt(0).toUpperCase() + role.slice(1)
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  // The backend returns ISO timestamps. We render
  // the user-facing form (locale-short month + day
  // + year) — the existing `formatDate` helper
  // could be used but a tiny inline formatter keeps
  // this component self-contained.
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

function canInvite(role: TeamMemberRole | undefined): boolean {
  if (!role) return false
  return INVITER_ROLES.includes(role)
}

export function TeamPanel() {
  const currentUser = useAuthStore((s) => s.user)
  const currentRole = currentUser?.role
  const userIsInviter = canInvite(currentRole)

  const { data, isLoading, isError, error, refetch } = useTeamMembers()
  const [inviteOpen, setInviteOpen] = useState(false)

  const openInvite = useCallback(() => setInviteOpen(true), [])
  const closeInvite = useCallback(() => setInviteOpen(false), [])

  return (
    <Card data-testid="team-panel">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-base font-semibold tracking-tight">Team</h2>
            <p className="text-sm text-paper-200/70">
              The members of your workspace. Owners and admins can invite teammates.
            </p>
          </div>
          {userIsInviter ? (
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={openInvite}
              data-testid="team-invite-button"
            >
              <Icon name="Mail" className="h-3.5 w-3.5" />
              <span>Invite by email</span>
            </Button>
          ) : null}
        </div>

        {isLoading ? <TeamPanelSkeleton /> : null}

        {!isLoading && isError ? (
          <ErrorState
            title="Unable to load your team"
            description="We couldn't reach the team-members service. Check your connection and try again."
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
        ) : null}

        {!isLoading && !isError && data ? (
          data.items.length === 0 ? (
            <TeamPanelEmpty canInvite={userIsInviter} onInvite={openInvite} />
          ) : (
            <TeamMemberTable members={data.items} />
          )
        ) : null}
      </CardContent>

      <InviteMemberModal open={inviteOpen} onOpenChange={setInviteOpen} onClose={closeInvite} />
    </Card>
  )
}

function TeamPanelSkeleton() {
  return (
    <output data-testid="team-panel-skeleton" className="block space-y-2" aria-label="Loading team">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </output>
  )
}

function TeamPanelEmpty({ canInvite, onInvite }: { canInvite: boolean; onInvite: () => void }) {
  return (
    <EmptyState
      icon="Users"
      title="No teammates yet"
      description="Invite your team to collaborate on your Cortex workspace."
      actionLabel={canInvite ? "Invite your team" : undefined}
      onAction={canInvite ? onInvite : undefined}
      data-testid="team-panel-empty"
    />
  )
}

function TeamMemberTable({ members }: { members: TeamMember[] }) {
  return (
    <Table data-testid="team-member-table">
      <TableHeader>
        <TableRow>
          <TableCell tag="th">Member</TableCell>
          <TableCell tag="th">Role</TableCell>
          <TableCell tag="th">Joined</TableCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((m) => (
          <TableRow key={m.id} data-testid={`team-row-${m.id}`}>
            <TableCell>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-paper-50">{m.full_name || m.email}</span>
                {m.full_name ? <span className="text-xs text-paper-200/60">{m.email}</span> : null}
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={roleBadgeTone(m.role)} size="sm" data-testid={`team-role-${m.id}`}>
                {roleLabel(m.role)}
              </Badge>
            </TableCell>
            <TableCell className="text-xs text-paper-200/70">{formatDate(m.created_at)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
