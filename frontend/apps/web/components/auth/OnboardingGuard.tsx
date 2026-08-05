/**
 * OnboardingGuard — central route guard for workspace onboarding.
 *
 * **F2 Part 3 (Task 24).**
 *
 * Rules:
 *   - User Authenticated + No Tenant → Redirect `/workspace-setup`
 *   - User Authenticated + Tenant Exists → Render children
 *   - User Not Authenticated → Redirect `/login`
 *
 * Centralizes onboarding gating so individual pages don't duplicate logic.
 */

"use client"

import { useRouter } from "next/navigation"
import { type ReactNode, useEffect, useState } from "react"

import { Spinner } from "@cortex/ui"

import { useSessionRestore } from "@/hooks/auth/useSessionRestore"
import { useAuthStore } from "@/lib/auth/store"

export interface OnboardingGuardProps {
  children: ReactNode
}

export function OnboardingGuard({ children }: OnboardingGuardProps) {
  const router = useRouter()
  const hydrated = useAuthStore((s) => s.hydrated)
  const isAuthed = useAuthStore((s) => s.isAuthenticated())
  const hasTenant = useAuthStore((s) => s.hasTenant())
  const [mounted, setMounted] = useState(false)

  const { isRestoring } = useSessionRestore()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || !hydrated || isRestoring) return

    if (!isAuthed) {
      router.replace(`/login?next=${encodeURIComponent("/app/dashboard")}` as never)
      return
    }

    if (!hasTenant) {
      router.replace("/workspace-setup" as never)
    }
  }, [mounted, hydrated, isRestoring, isAuthed, hasTenant, router])

  if (!mounted || !hydrated || isRestoring) {
    return (
      <output
        className="flex min-h-screen items-center justify-center bg-background"
        aria-live="polite"
      >
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Spinner size="lg" />
          <p className="text-sm">Checking workspace access…</p>
        </div>
      </output>
    )
  }

  if (!isAuthed || !hasTenant) {
    return (
      <output
        className="flex min-h-screen items-center justify-center bg-background"
        aria-live="polite"
      >
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Spinner size="lg" />
          <p className="text-sm">Redirecting…</p>
        </div>
      </output>
    )
  }

  return <>{children}</>
}
