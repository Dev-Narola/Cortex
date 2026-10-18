import { getApiClient } from "@/lib/auth/api-client"

import type { TeamMember, UpdateMemberRequest } from "./types"

export function updateMember(id: string, body: UpdateMemberRequest): Promise<TeamMember> {
  return getApiClient().patch<TeamMember>(`/api/v1/users/${encodeURIComponent(id)}`, body)
}
