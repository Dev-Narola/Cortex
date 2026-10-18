import { getApiClient } from "@/lib/auth/api-client"

export interface PasswordResetLink {
  reset_token: string
  /** Seconds until the token expires (1 hour). */
  expires_in: number
}

/** `POST /api/v1/users/{id}/password-reset` — owner/admin only; token shown once. */
export function issuePasswordReset(userId: string): Promise<PasswordResetLink> {
  return getApiClient().post<PasswordResetLink>(
    `/api/v1/users/${encodeURIComponent(userId)}/password-reset`,
  )
}
