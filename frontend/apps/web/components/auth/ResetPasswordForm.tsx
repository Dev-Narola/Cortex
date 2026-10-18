/**
 * ResetPasswordForm — redeem a reset link from a workspace owner/admin:
 * choose a new password, then sign in with it.
 */

"use client"

import Link from "next/link"
import { type FormEvent, useState } from "react"

import { Button, Input, Label } from "@cortex/ui"

import { toFrontendError } from "@/lib/http/errors"
import { resetPassword } from "@/services/auth"

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  if (done) {
    return (
      <div className="space-y-4 text-sm text-muted-foreground">
        <output className="block">
          Your password has been changed. Sign in with the new password.
        </output>
        <Button asChild className="w-full">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8) return setError("Use at least 8 characters.")
    if (password !== confirm) return setError("The passwords don't match.")
    setError(null)
    setSubmitting(true)
    try {
      await resetPassword({ token, password })
      setDone(true)
    } catch (err) {
      const fe = toFrontendError(err)
      setError(
        fe.kind === "unauthorized"
          ? "This reset link is invalid, expired, or already used. Ask for a new one."
          : fe.message,
      )
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" aria-label="Set a new password" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="new-password">New password</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby="new-password-hint"
        />
        <p id="new-password-hint" className="text-xs text-faint">
          8 to 128 characters.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          maxLength={128}
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? "Saving…" : "Set new password"}
      </Button>
    </form>
  )
}
