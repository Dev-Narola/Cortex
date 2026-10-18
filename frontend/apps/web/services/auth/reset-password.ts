/**
 * `POST /api/v1/auth/reset-password` — set a new password with a one-time
 * reset token issued by a workspace owner/admin (there is no email flow).
 */

import { getApiClient } from "@/lib/auth/api-client"

export interface ResetPasswordRequest {
  token: string
  /** 8–128 characters (backend rule). */
  password: string
}

export async function resetPassword(input: ResetPasswordRequest): Promise<void> {
  await getApiClient().post("/api/v1/auth/reset-password", input)
}
