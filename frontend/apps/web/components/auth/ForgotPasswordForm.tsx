/**
 * ForgotPasswordForm — the email-only form.
 *
 * **F2 Part 1 (Task 3).** RHF + Zod, wired to
 * `POST /auth/forgot-password`. The backend always
 * returns 200 to avoid leaking which emails are
 * registered; the UI treats the request as
 * fire-and-forget.
 *
 * **Success state.** After a successful submit the
 * form replaces itself with a confirmation panel:
 * "If an account exists for ... we sent a link".
 */

"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { useForm } from "react-hook-form"

import { Button, Input, Label, Spinner, Text } from "@cortex/ui"

import { type ForgotPasswordInput, forgotPasswordSchema } from "@/lib/auth/forgot-password.schema"
import { toFrontendError } from "@/lib/http/errors"
import { forgotPassword } from "@/services/auth"

export function ForgotPasswordForm() {
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  })

  async function onSubmit(values: ForgotPasswordInput) {
    setError(null)
    try {
      await forgotPassword({ email: values.email })
      setSubmittedEmail(values.email)
    } catch (err) {
      const fe = toFrontendError(err)
      setError(fe.message)
    }
  }

  if (submittedEmail) {
    return (
      <output className="block space-y-3" aria-live="polite">
        <Text>
          If an account exists for{" "}
          <span className="font-medium text-foreground">{submittedEmail}</span>, we&apos;ve sent a
          password reset link.
        </Text>
        <Text size="sm" tone="muted">
          Check your inbox. The link expires in 30 minutes.
        </Text>
      </output>
    )
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4"
      aria-label="Reset your password"
      noValidate
    >
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
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

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Spinner size="sm" />
            <span>Sending link…</span>
          </>
        ) : (
          "Send reset link"
        )}
      </Button>
    </form>
  )
}
