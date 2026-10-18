/**
 * AcceptInviteForm — redeem an invitation link: choose a password (and
 * optionally a name), then land signed in on the dashboard.
 */

"use client"

import { useRouter } from "next/navigation"
import { type FormEvent, useState } from "react"

import { Button, Input, Label } from "@cortex/ui"

import { type AuthSession, useAuthStore } from "@/lib/auth/store"
import { toFrontendError } from "@/lib/http/errors"
import { acceptInvite, toAuthUser } from "@/services/auth"

export function AcceptInviteForm({ token }: { token: string }) {
  const router = useRouter()
  const storeLogin = useAuthStore((s) => s.login)
  const [fullName, setFullName] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!token) {
    return (
      <p role="alert" className="text-sm text-muted-foreground">
        This invitation link is incomplete. Ask the person who invited you to send it again.
      </p>
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError("Use at least 8 characters.")
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const data = await acceptInvite({
        token,
        password,
        ...(fullName.trim() ? { full_name: fullName.trim() } : {}),
      })
      const session: AuthSession = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
        user: toAuthUser(data.user),
        tenant: data.tenant,
      }
      storeLogin(session)
      router.push("/app/dashboard" as never)
    } catch (err) {
      const fe = toFrontendError(err)
      setError(
        fe.kind === "unauthorized" || fe.kind === "not_found" || fe.kind === "validation"
          ? "This invitation is invalid, expired, or already used. Ask for a new link."
          : fe.message,
      )
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" aria-label="Accept invitation" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="full_name">Full name (optional)</Label>
        <Input
          id="full_name"
          autoComplete="name"
          maxLength={255}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Choose a password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={error ? "true" : undefined}
          aria-describedby="password-hint"
        />
        <p id="password-hint" className="text-xs text-faint">
          8 to 128 characters.
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? "Joining…" : "Join workspace"}
      </Button>
    </form>
  )
}
