/**
 * useRegister — imperative wrapper around the
 * register form. Same pattern as `useLogin` — most
 * consumers use `RegisterForm` directly; this hook
 * is the imperative alternative.
 */

"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { type AuthSession, useAuthStore } from "@/lib/auth/store"
import { toFrontendError } from "@/lib/http/errors"
import { type RegisterRequest, register, toAuthUser } from "@/services/auth"

export interface UseRegisterResult {
  register: (input: RegisterRequest) => Promise<void>
  loading: boolean
  error: string | null
  reset: () => void
}

export function useRegister(redirectTo = "/app"): UseRegisterResult {
  const router = useRouter()
  const storeLogin = useAuthStore((s) => s.login)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function registerFn(input: RegisterRequest): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const data = await register(input)
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
      setError(fe.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return {
    register: registerFn,
    loading,
    error,
    reset: () => setError(null),
  }
}
