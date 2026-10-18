/**
 * `POST /api/v1/auth/accept-invite` — redeem an invite token: creates the
 * account in the inviting workspace and returns a session (same shape as login).
 */

import { getApiClient } from "@/lib/auth/api-client"

import type { LoginResponse } from "./login"

export interface AcceptInviteRequest {
  token: string
  /** 8–128 characters (backend rule). */
  password: string
  full_name?: string
}

export function acceptInvite(input: AcceptInviteRequest): Promise<LoginResponse> {
  return getApiClient().post<LoginResponse>("/api/v1/auth/accept-invite", input)
}
