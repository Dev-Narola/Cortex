/**
 * RegisterForm — the name + email + password + confirm
 * + accept-terms form.
 *
 * **F2 Part 1 (Tasks 3 + 7).** RHF + Zod, wired to
 * `POST /auth/register` via the auth service.
 *
 * **Inline validation (per spec).** Field-level errors
 * render under their input. Server-side errors:
 *   - 400/422 with field-level `detail[]` → bind the
 *     `field` to the matching RHF input.
 *   - 409 / "email already exists" → inline error on
 *     the `email` field.
 *   - 5xx → banner error.
 *
 * **Known backend issue.** The deployed
 * `POST /auth/register` currently 500s because the
 * backend's Redis dependency is down on the EC2 host.
 * The wire path + the schemas + the inline duplicate-
 * email handling all assume the real backend; once
 * Redis is back up the flow works end-to-end without
 * code changes.
 */

"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Controller, useForm } from "react-hook-form"

import { Button, Checkbox, Input, Label, Spinner, Text } from "@cortex/ui"

import { type RegisterInput, registerSchema } from "@/lib/auth/register.schema"
import { type AuthSession, useAuthStore } from "@/lib/auth/store"
import { resolvePostAuthDestination } from "@/lib/auth/post-auth-destination"
import { toFrontendError } from "@/lib/http/errors"
import { register as registerUser, toAuthUser } from "@/services/auth"

export function RegisterForm() {
  const router = useRouter()
  const storeLogin = useAuthStore((s) => s.login)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirm_password: "",
      accept_terms: false as unknown as true,
    },
  })

  async function onSubmit(values: RegisterInput) {
    setServerError(null)
    try {
      const data = await registerUser({
        name: values.name,
        email: values.email,
        password: values.password,
      })
      const session: AuthSession = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
        user: toAuthUser(data.user),
        tenant: data.tenant,
      }
      storeLogin(session)
      router.push(resolvePostAuthDestination(null) as never)
    } catch (err) {
      const fe = toFrontendError(err)
      // Inline validation: bind field-level errors to RHF.
      if (fe.fields.length > 0) {
        for (const f of fe.fields) {
          if (f.field in values) {
            // RHF's `setError` generic is locked to the form
            // schema's keys; we narrow with a runtime check.
            setError(f.field as Parameters<typeof setError>[0], {
              type: "server",
              message: f.message,
            })
          }
        }
      }
      // Duplicate-email inline (per spec).
      if (fe.kind === "validation" && /email/i.test(fe.message)) {
        setError("email", {
          type: "server",
          message: "An account with this email already exists.",
        })
      } else if (fe.status === 409) {
        setError("email", {
          type: "server",
          message: "An account with this email already exists.",
        })
      } else {
        // Surface a useful message for every other case.
        // For 422 specifically, include the status so
        // the user knows it's a backend validation
        // issue, not a form issue.
        const detail =
          fe.status !== null
            ? `${fe.message} (HTTP ${fe.status})`
            : fe.message
        setServerError(detail)
      }
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4"
      aria-label="Create your account"
      noValidate
    >
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          type="text"
          autoComplete="name"
          aria-invalid={errors.name ? "true" : undefined}
          aria-describedby={errors.name ? "name-error" : undefined}
          {...register("name")}
        />
        {errors.name ? (
          <p id="name-error" className="text-xs text-destructive">
            {errors.name.message}
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
        <Label htmlFor="confirm_password">Confirm password</Label>
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

      <div className="flex items-start gap-2">
        <Controller
          control={control}
          name="accept_terms"
          render={({ field }) => (
            <Checkbox
              id="accept_terms"
              checked={field.value === true}
              onCheckedChange={(v) => field.onChange(v === true)}
              ref={field.ref}
            />
          )}
        />
        <Label htmlFor="accept_terms" className="text-sm font-normal leading-snug">
          I agree to the Terms of Service and Privacy Policy.
        </Label>
      </div>
      {errors.accept_terms ? (
        <p className="text-xs text-destructive">{errors.accept_terms.message}</p>
      ) : null}

      {serverError ? (
        <p className="text-sm text-destructive" role="alert">
          {serverError}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Spinner size="sm" />
            <span>Creating account…</span>
          </>
        ) : (
          "Create account"
        )}
      </Button>
    </form>
  )
}
