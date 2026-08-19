/**
 * Team — types.
 *
 * **F7 Part 1 (Tasks 14, 25).** Narrow UI mapping for the
 * team / member data the Settings page consumes.
 *
 * **Why hand-rolled (not a generated type).** The generated
 * OpenAPI types in `@cortex/api-client/types` are the
 * authoritative backend contract; this file deliberately
 * mirrors a *subset* of what the backend exposes for the
 * Team panel. The contract is small enough that keeping a
 * local type here is cleaner than threading the full
 * `components["schemas"]["..."]` everywhere.
 *
 * **`hashed_password` is never modelled.** The backend's
 * user table carries a `hashed_password` column, but the
 * `GET /users` response will (and must) omit it. The
 * `TeamMember` type below doesn't even reference the
 * concept — there's no way for a frontend consumer to
 * accidentally ask for it.
 *
 * **Roles.** The PRD / RBAC ADR-0004 define four
 * tenant-scoped roles: `owner`, `admin`, `member`, `viewer`.
 * We model the type as the union of those four so the
 * Badge can render every role with a dedicated style.
 *
 * **Server response contract — what we expect.** The
 * backend currently does not expose `GET /users` (verified
 * against `Cortex/src/identity/interface/rest/routes.py`).
 * F7 Part 1 ships the UI + this type + a service that
 * calls the expected endpoint; the endpoint itself is a
 * backend gap that the next backend change will close.
 * The UI gracefully handles the 404 with a clear error
 * state — see `team-panel.tsx`.
 */

export type TeamMemberRole = "owner" | "admin" | "member" | "viewer"

/**
 * Roles an inviter can assign through the invite form.
 *
 * The PRD explicitly says only `owner`/`admin` can invite
 * (RBAC ADR-0004). It also says `owner` is set at tenant
 * creation and not through the invite form, so the
 * invite selector exposes `admin`, `member`, `viewer` only.
 * The `OWNER_ROLES` constant on the panel re-uses this
 * shape to gate the "Invite by email" button.
 */
export type InvitableRole = Exclude<TeamMemberRole, "owner">

/**
 * A single team member. The shape mirrors what the
 * future `GET /users` response will return.
 */
export interface TeamMember {
  /** Backend UUID. The primary key for any
   *  future "change role" / "remove" action. */
  id: string
  /** Email address. The user-facing identifier in
   *  the table (the UI never renders the UUID). */
  email: string
  /** Optional display name. Renders as a fallback
   *  if the email is a `+`-style alias. */
  full_name?: string | null
  /** Tenant-scoped role. Drives the badge. */
  role: TeamMemberRole
  /** True while the user is active. The UI surfaces
   *  this via a subtle "Disabled" badge if needed;
   *  Part 1 doesn't act on it. */
  is_active?: boolean
  /** ISO timestamp. Used for the "Joined" column. */
  created_at: string
  /** ISO timestamp. Used for the "Last seen" column
   *  when present. */
  last_login?: string | null
}

/**
 * Paginated envelope. The backend's list endpoints use
 * the same shape (`{ items, total, limit, offset }`) —
 * the team list is small enough that Part 1 doesn't
 * need pagination, but modelling it now keeps the
 * service call forward-compatible.
 */
export interface TeamListResponse {
  items: TeamMember[]
  total: number
  limit: number
  offset: number
}

/**
 * Body for the invite mutation.
 *
 * `role` is the *inviter-chosen* role, not the
 * member's effective role on the team (the member
 * may have an existing role on a different tenant).
 * The backend resolves the actual assignment.
 */
export interface InviteMemberRequest {
  email: string
  role: InvitableRole
}

/**
 * Response for the invite mutation.
 *
 * The backend (when the endpoint lands) will likely
 * echo the new member or return a 201 with the new
 * member resource. We model the minimum the UI needs
 * to refresh the list and to surface a success toast.
 */
export interface InviteMemberResponse {
  /** The newly created / invited member. */
  member: TeamMember
  /**
   * Optional: an invitation token the platform
   * emails to the invitee. Most teams won't see
   * this — it's an implementation detail of the
   * backend's invitation flow. The UI never
   * displays it.
   */
  invitation_token?: string
}
