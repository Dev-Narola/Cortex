/**
 * postAuthDestination — pick the right URL to navigate
 * to after a successful login / register.
 *
 * **F2 Part 2 (Task 20).** Two possibilities:
 *   - User has a tenant → `/app/dashboard`.
 *   - User has no tenant → `/workspace-setup` (the
 *     onboarding step that creates the tenant).
 *
 * `?next=...` overrides the default if present and is a
 * safe relative path (starts with `/` and doesn't contain
 * a protocol). Otherwise we fall back to the
 * tenant-based default.
 *
 * **The `?next=` precedence is a security boundary.** A
 * raw user-supplied `next` that points to an external
 * origin (e.g. `?next=https://evil.com`) is rejected —
 * the function returns the tenant default. This stops an
 * open-redirect.
 */

import { useAuthStore } from "@/lib/auth/store"

/**
 * Returns the safe next URL given the `?next=` query
 * string + the current tenant state. Pure function.
 */
export function resolvePostAuthDestination(next: string | null): string {
  // Tenant check first (the auth store is the source of
  // truth — the login/register responses may or may not
  // include a tenant).
  const hasTenant = useAuthStore.getState().hasTenant()
  const defaultDestination = hasTenant ? "/app/dashboard" : "/workspace-setup"

  if (!next) return defaultDestination
  // Reject anything that isn't a relative path on our own
  // origin. Block protocol-relative URLs (`//evil.com`).
  if (!next.startsWith("/") || next.startsWith("//")) {
    return defaultDestination
  }
  return next
}
