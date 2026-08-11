/**
 * useCurrentUserRole — thin selector for the
 * authenticated user's role.
 *
 * **F5 Part 2 (Task 26-27).** The UI/UX
 * cross-cutting rule says: a viewer-role user
 * never sees a Delete action. The hook returns
 * the role from the existing F2 auth store so
 * the action menu can hide / show actions
 * without inventing a new "useUserRole" hook.
 *
 * **`null` when signed out.** The auth store
 * returns `null` for `user` between the initial
 * restore + the first login. We propagate that
 * so the caller can treat "not signed in yet"
 * as "no destructive actions".
 *
 * **Frontend-only.** The backend remains the
 * final authorisation boundary. The UI hiding
 * is a UX rule; the backend's role check is the
 * security rule.
 */

"use client"

import { useAuthStore } from "@/lib/auth/store"
import type { AuthRole } from "@/lib/auth/store"

export function useCurrentUserRole(): AuthRole | null {
  return useAuthStore((s) => s.user?.role ?? null)
}
