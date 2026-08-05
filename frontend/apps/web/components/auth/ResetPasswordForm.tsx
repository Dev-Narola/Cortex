/**
 * ResetPasswordForm — the new-password form on
 * `/reset-password?token=...`.
 *
 * **F2 Part 1 (Task 3).** RHF + Zod, wired to
 * `POST /auth/reset-password`.
 *
 * **Token from URL.** The `token` comes from the
 * `?token=...` query string and is passed into RHF's
 * default values. The page wraps this form in a
 * Suspense boundary (Next.js requires it for
 * `useSearchParams()`).
 *
 * **Token validation.** The client only checks "is
 * the token present"; the actual validity check
 * happens on the backend. A 401 here means the
 * token is expired / invalid.
 */

"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { useForm } from "react-hook-form"

import { Button, Input, Label, Spinner, Text } from "@cortex/ui"

import { type ResetPasswordInput, resetPasswordSchema } from "@/lib/auth/reset-password.schema"
import { toFrontendError } from "@/lib/http/errors"
import { resetPassword } from "@/services/auth"

export function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token") ?? ""
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: "", confirm_password: "" },
  })

  async function onSubmit(values: ResetPasswordInput) {
    setError(null)
    try {
      await resetPassword({ token: values.token, password: values.password })
      // Success — bounce to /login with a flag the login
      // page could (F2+) read; for now a direct push.
      router.push("/login?reset=success")
    } catch (err) {
      const fe = toFrontendError(err)
      if (fe.kind === "unauthorized" || fe.kind === "validation") {
        setError("This reset link is invalid or has expired. Request a new one.")
      } else {
        setError(fe.message)
      }
    }
  }

  if (!token) {
    return (
      <output className="block space-y-3">
        <Text>No reset token found in the URL.</Text>
        <Text size="sm" tone="muted">
          Open the link from the reset email, or{" "}
          <Link
            href={"/forgot-password" as never}
            className="text-ember-600 underline-offset-4 hover:underline"
          >
            request a new one
          </Link>
          .
        </Text>
      </output>
    )
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4"
      aria-label="Set a new password"
      noValidate
    >
      <input type="hidden" {...register("token")} />
      <div className="space-y-1.5">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={errors.password ? "true" : undefined}
          aria-describedby={errors.password ? "password-error" : undefined}
          {...register("password")}
        />
        {errors.password ? (
          <p id="password-error" className="text-xs text-destructive">
            {errors.password.message}
          </p>
        ) : null}
        <Text size="xs" tone="muted">
          At least 8 characters with upper, lower, and a digit.
        </Text>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm_password">Confirm new password</Label>
        <Input
          id="confirm_password"
          type="password"
          autoComplete="new-password"
          aria-invalid={errors.confirm_password ? "true" : undefined}
          aria-describedby={errors.confirm_password ? "confirm_password-error" : undefined}
          {...register("confirm_password")}
        />
        {errors.confirm_password ? (
          <p id="confirm_password-error" className="text-xs text-destructive">
            {errors.confirm_password.message}
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
            <span>Updating…</span>
          </>
        ) : (
          "Update password"
        )}
      </Button>
    </form>
  )
}
