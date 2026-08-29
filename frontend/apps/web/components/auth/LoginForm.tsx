/**
 * LoginForm — the workspace + email + password form.
 *
 * **F2 Part 1 (Tasks 3 + 6).** RHF + Zod, wired to
 * `POST /auth/login` via the auth service. On success
 * the auth store receives the session and the router
 * pushes the `?next=` destination (or `/app`).
 *
 * **Loading state.** The submit button is disabled +
 * shows "Signing in…" + a spinner while the request
 * is in flight. The form fields stay editable (the
 * spec calls for disabling the submit only).
 *
 * **Error handling.** Catches `ApiError` and maps to a
 * `FrontendError` via `toFrontendError` so the UI
 * never deals with raw status codes. The duplicate-
 * email case doesn't apply here (login can't tell
 * whether the email exists — the 401 is
 * "Invalid email, password, or workspace" by design).
 *
 * **The Suspense boundary.** `useSearchParams()` opts
 * this component out of static rendering. Next.js
 * requires a Suspense boundary around it; the page
 * wraps the form in one.
 */

"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { useForm } from "react-hook-form"

import { Button, Input, Label, Spinner } from "@cortex/ui"

import { type LoginInput, loginSchema } from "@/lib/auth/login.schema"
import { type AuthSession, useAuthStore } from "@/lib/auth/store"
import { resolvePostAuthDestination } from "@/lib/auth/post-auth-destination"
import { toFrontendError } from "@/lib/http/errors"
import { login, toAuthUser } from "@/services/auth"

import {
  LOGIN_COMPLETED,
  LOGIN_FAILED,
  LOGIN_STARTED,
  track,
} from "@/lib/analytics"

export interface LoginFormProps {
  /** Path to navigate to on success. Default `?next=...` or `/app`. */
  nextPath?: string
}

export function LoginForm({ nextPath }: LoginFormProps = {}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const storeLogin = useAuthStore((s) => s.login)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { tenant_slug: "", email: "", password: "" },
  })

  async function onSubmit(values: LoginInput) {
    setError(null)
    // F10-Part 4: login_started fires on
    // submit. No email / password / tenant
    // slug in the payload.
    track(LOGIN_STARTED)
    try {
      const data = await login(values)
      const session: AuthSession = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
        user: toAuthUser(data.user),
        tenant: data.tenant,
      }
      storeLogin(session)
      // F10-Part 4: login_completed fires on
      // the success path.
      track(LOGIN_COMPLETED)
      // Post-auth destination: with-tenant → /app/dashboard,
      // without-tenant → /workspace-setup. A `?next=...` query
      // parameter (validated by resolvePostAuthDestination)
      // overrides the default.
      const requested = nextPath ?? searchParams.get("next") ?? null
      const destination = resolvePostAuthDestination(requested)
      router.push(destination as never)
    } catch (err) {
      const fe = toFrontendError(err)
      // F10-Part 4: login_failed fires with
      // a sanitised `reason` — never the raw
      // error string.
      track(LOGIN_FAILED, { reason: fe.kind })
      // Per spec: "Invalid email, password, or workspace." is
      // the canonical login failure message — don't leak
      // which one was wrong.
      if (fe.kind === "unauthorized") {
        setError("Invalid email, password, or workspace.")
      } else {
        setError(fe.message)
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" aria-label="Sign in" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="tenant_slug">Workspace</Label>
        <Input
          id="tenant_slug"
          type="text"
          autoComplete="organization"
          placeholder="acme"
          aria-invalid={errors.tenant_slug ? "true" : undefined}
          aria-describedby={errors.tenant_slug ? "tenant_slug-error" : undefined}
          {...register("tenant_slug")}
        />
        {errors.tenant_slug ? (
          <p id="tenant_slug-error" className="text-xs text-destructive">
            {errors.tenant_slug.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={errors.email ? "true" : undefined}
          aria-describedby={errors.email ? "email-error" : undefined}
          {...register("email")}
        />
        {errors.email ? (
          <p id="email-error" className="text-xs text-destructive">
            {errors.email.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password ? "true" : undefined}
          aria-describedby={errors.password ? "password-error" : undefined}
          {...register("password")}
        />
        {errors.password ? (
          <p id="password-error" className="text-xs text-destructive">
            {errors.password.message}
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Spinner size="sm" />
            <span>Signing in…</span>
          </>
        ) : (
          "Sign in"
        )}
      </Button>
    </form>
  )
}
