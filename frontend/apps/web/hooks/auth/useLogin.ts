/**
 * useLogin — imperative wrapper around the login form.
 *
 * **F2 Part 1 (Task 5 + 6).** Most forms will use
 * `LoginForm` directly (it composes RHF + the auth
 * service internally). This hook is the alternative
 * for screens that want to do login imperatively
 * (e.g. an "Sign in with email" button on the
 * marketing landing page).
 *
 * **No state.** Returns `{ login, loading, error }`;
 * the caller composes the form.
 */

"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { type AuthSession, useAuthStore } from "@/lib/auth/store"
import { toFrontendError } from "@/lib/http/errors"
import { type LoginRequest, login, toAuthUser } from "@/services/auth"

export interface UseLoginResult {
  login: (input: LoginRequest) => Promise<void>
  loading: boolean
  error: string | null
  reset: () => void
}

export function useLogin(redirectTo = "/app"): UseLoginResult {
  const router = useRouter()
  const storeLogin = useAuthStore((s) => s.login)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loginFn(input: LoginRequest): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const data = await login(input)
      const session: AuthSession = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
        user: toAuthUser(data.user),
        tenant: data.tenant,
      }
      storeLogin(session)
      router.push(redirectTo as never)
    } catch (err) {
      const fe = toFrontendError(err)
      if (fe.kind === "unauthorized") {
        setError("Invalid email, password, or workspace.")
      } else {
        setError(fe.message)
      }
      throw err
    } finally {
      setLoading(false)
    }
  }

  return {
    login: loginFn,
    loading,
    error,
    reset: () => setError(null),
  }
}
