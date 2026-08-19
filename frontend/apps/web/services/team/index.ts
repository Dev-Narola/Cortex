/**
 * Team — service barrel.
 *
 * F7 Part 1. Every team-related service the rest of
 * the app needs to import lives here. The shape
 * mirrors the F0–F6 service barrels
 * (`services/conversations/index.ts`,
 * `services/documents/index.ts`).
 */

export { listTeamMembers, type ListTeamMembersParams } from "./listTeamMembers"
export { inviteMember, type InviteMemberParams } from "./inviteMember"
export type {
  InvitableRole,
  InviteMemberRequest,
  InviteMemberResponse,
  TeamListResponse,
  TeamMember,
  TeamMemberRole,
} from "./types"
