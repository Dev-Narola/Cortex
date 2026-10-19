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
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  ErrorState,
  Icon,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  toast,
} from "@cortex/ui"

import { useTeamMembers, useUpdateMember } from "@/hooks/team"
import { useAuthStore } from "@/lib/auth/store"
import { toFrontendError } from "@/lib/http/errors"
import { type TeamMember, type TeamMemberRole, issuePasswordReset } from "@/services/team"

import { SectionHeader } from "../section-header"
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

  // GET /users is owner/admin-only on the backend; don't call it for others.
  const { data, isLoading, isError, error, refetch } = useTeamMembers({ enabled: userIsInviter })
  const [inviteOpen, setInviteOpen] = useState(false)

  const openInvite = useCallback(() => setInviteOpen(true), [])
  const closeInvite = useCallback(() => setInviteOpen(false), [])

  return (
    <section data-testid="team-panel" className="space-y-4">
      <SectionHeader
        title="Team"
        description="The members of your workspace. Owners and admins can invite teammates."
        actions={
          userIsInviter ? (
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
          ) : undefined
        }
      />
      <Card radius="xl">
        <CardContent className="space-y-4 p-0 sm:p-1">
          {!userIsInviter ? (
            <p className="text-sm text-muted-foreground" data-testid="team-panel-restricted">
              Only workspace owners and admins can view and manage members.
            </p>
          ) : null}

          {userIsInviter && isLoading ? <TeamPanelSkeleton /> : null}

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
            data.length <= 1 ? (
              <>
                {data.length === 1 ? <TeamMemberTable members={data} /> : null}
                <TeamPanelEmpty canInvite={userIsInviter} onInvite={openInvite} />
              </>
            ) : (
              <TeamMemberTable members={data} />
            )
          ) : null}
        </CardContent>
      </Card>

      <InviteMemberModal open={inviteOpen} onOpenChange={setInviteOpen} onClose={closeInvite} />
    </section>
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
  const me = useAuthStore((s) => s.user)
  const update = useUpdateMember()
  const isOwner = me?.role === "owner"
  const [resetLink, setResetLink] = useState<{ email: string; url: string } | null>(null)
  const [issuing, setIssuing] = useState<string | null>(null)

  async function issueReset(m: TeamMember) {
    setIssuing(m.id)
    try {
      const { reset_token } = await issuePasswordReset(m.id)
      setResetLink({
        email: m.email,
        url: `${window.location.origin}/reset-password?token=${encodeURIComponent(reset_token)}`,
      })
    } catch (err) {
      toast({
        title: "Couldn't create a reset link",
        description: toFrontendError(err).message,
        variant: "destructive",
      })
    } finally {
      setIssuing(null)
    }
  }

  // Owners manage everyone but themselves; admins manage members and viewers.
  // Mirrors the backend rule that only an owner may grant owner/admin.
  function canManage(m: TeamMember): boolean {
    if (!me || m.id === me.id) return false
    if (isOwner) return true
    return me.role === "admin" && (m.role === "member" || m.role === "viewer")
  }

  async function change(m: TeamMember, body: { role?: TeamMemberRole; is_active?: boolean }) {
    try {
      await update.mutateAsync({ id: m.id, ...body })
    } catch (err) {
      toast({
        title: "Couldn't update the member",
        description: toFrontendError(err).message,
        variant: "destructive",
      })
    }
  }

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <Table data-testid="team-member-table">
        <TableHeader>
          <TableRow>
            <TableCell tag="th">Member</TableCell>
            <TableCell tag="th">Role</TableCell>
            <TableCell tag="th">Status</TableCell>
            <TableCell tag="th" className="hidden lg:table-cell">
              Joined
            </TableCell>
            <TableCell tag="th">
              <span className="sr-only">Actions</span>
            </TableCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => {
            const manageable = canManage(m)
            const grantable: TeamMemberRole[] = isOwner
              ? ["owner", "admin", "member", "viewer"]
              : ["member", "viewer"]
            return (
              <TableRow
                key={m.id}
                data-testid={`team-row-${m.id}`}
                className={m.is_active === false ? "opacity-60" : undefined}
              >
                <TableCell>
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar
                      size="sm"
                      tone={m.id === me?.id ? "primary" : "accent"}
                      name={m.full_name || m.email}
                      fallback={(m.full_name || m.email).charAt(0).toUpperCase()}
                    />
                    <div className="flex min-w-0 flex-col">
                      <span
                        className="max-w-[18rem] truncate text-sm font-medium text-foreground"
                        title={m.full_name || m.email}
                      >
                        {m.full_name || m.email}
                        {m.id === me?.id ? (
                          <span className="ml-1.5 text-xs font-normal text-faint">(you)</span>
                        ) : null}
                      </span>
                      {m.full_name ? (
                        <span className="max-w-[18rem] truncate text-xs text-faint" title={m.email}>
                          {m.email}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {manageable ? (
                    <Select
                      value={m.role}
                      onValueChange={(role) => void change(m, { role: role as TeamMemberRole })}
                      disabled={update.isPending}
                    >
                      <SelectTrigger
                        className="h-8 w-28"
                        aria-label={`Role for ${m.email}`}
                        data-testid={`team-role-${m.id}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {grantable.map((r) => (
                          <SelectItem key={r} value={r}>
                            {roleLabel(r)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge
                      variant={roleBadgeTone(m.role)}
                      size="sm"
                      data-testid={`team-role-${m.id}`}
                    >
                      {roleLabel(m.role)}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={m.is_active === false ? "secondary" : "success"} size="sm">
                    {m.is_active === false ? "Deactivated" : "Active"}
                  </Badge>
                </TableCell>
                <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground lg:table-cell">
                  {formatDate(m.created_at)}
                </TableCell>
                <TableCell className="text-right">
                  {manageable ? (
                    <div className="flex justify-end gap-1 whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={issuing === m.id || m.is_active === false}
                        onClick={() => void issueReset(m)}
                        data-testid={`team-reset-${m.id}`}
                      >
                        Reset password
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={update.isPending}
                        onClick={() => void change(m, { is_active: m.is_active === false })}
                        data-testid={`team-toggle-${m.id}`}
                      >
                        {m.is_active === false ? "Reactivate" : "Deactivate"}
                      </Button>
                    </div>
                  ) : null}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <ResetLinkDialog link={resetLink} onClose={() => setResetLink(null)} />
    </div>
  )
}

function ResetLinkDialog({
  link,
  onClose,
}: {
  link: { email: string; url: string } | null
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  return (
    <Dialog
      open={!!link}
      onOpenChange={(o) => {
        if (!o) {
          setCopied(false)
          onClose()
        }
      }}
    >
      <DialogContent size="md" data-testid="reset-link-dialog">
        <DialogHeader>
          <DialogTitle>Password reset link</DialogTitle>
          <DialogDescription>
            Send this link to {link?.email}. It works once and expires in 1 hour. Cortex doesn't
            email it.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            readOnly
            value={link?.url ?? ""}
            aria-label="Reset link URL"
            className="font-mono text-xs"
            onFocus={(e) => e.target.select()}
          />
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              if (!link) return
              await navigator.clipboard.writeText(link.url)
              setCopied(true)
            }}
          >
            <Icon name={copied ? "Check" : "Copy"} className="h-4 w-4" aria-hidden />
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
