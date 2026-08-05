/**
 * Auth service — forgot + reset password.
 *
 * **F2 Part 1 (Task 5).** Wraps the two password-recovery
 * endpoints:
 *   - `POST /auth/forgot-password` — fire-and-forget; the
 *     backend always returns 200 to avoid leaking
 *     registered emails.
 *   - `POST /auth/reset-password` — exchanges the email
 *     token for a new password.
 *
 * **No state.** Both services are pure fetch wrappers.
 */

import { getApiClient } from "@/lib/auth/api-client"

export interface ForgotPasswordRequest {
  email: string
}

export async function forgotPassword(input: ForgotPasswordRequest): Promise<void> {
  const client = getApiClient()
  await client.post("/api/v1/auth/forgot-password", input)
}

export interface ResetPasswordRequest {
  token: string
  password: string
}

export interface ResetPasswordResponse {
  success: boolean
}

export async function resetPassword(input: ResetPasswordRequest): Promise<ResetPasswordResponse> {
  const client = getApiClient()
  const data = await client.post<ResetPasswordResponse>("/api/v1/auth/reset-password", input)
  return data
}
