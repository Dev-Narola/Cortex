/**
 * Auth services — barrel.
 *
 * Re-exported by the app's `@/services/auth` import.
 */

export { acceptInvite, type AcceptInviteRequest } from "./accept-invite"
export { login, type LoginRequest, type LoginResponse } from "./login"
export { register, type RegisterRequest, type RegisterResponse } from "./register"
export { refresh, type RefreshResponse } from "./refresh"
export { logout, revokeRefreshToken } from "./logout"
export { resetPassword, type ResetPasswordRequest } from "./reset-password"

/**
 * Shared `toAuthUser` mapper — both login and register
 * return the same user shape; this normalises the snake_case
 * backend field names to the camelCase store shape.
 */
export function toAuthUser(user: {
  id: string
  email: string
  role: "owner" | "admin" | "member" | "viewer"
  tenant_id: string
}): import("@/lib/auth/store").AuthUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenant_id,
  }
}
