/**
 * WorkspaceSetupForm — the name + slug form.
 *
 * **F2 Part 2 (Task 13 + 14 + 17).** RHF + Zod, wired to
 * `POST /tenants` via the `useCreateWorkspace` mutation.
 * On success:
 *   1. Write the new tenant to the auth store.
 *   2. Mark onboarding complete.
 *   3. Trigger the light → dark theme transition.
 *   4. Navigate to `/app/dashboard`.
 *
 * **Auto-slug.** The slug field mirrors the name until
 * the user manually edits it. We track this with a
 * `slugTouched` ref-state so re-renders don't fight each
 * other.
 *
 * **Inline validation.**
 *   - Empty name / invalid slug → field-level Zod errors.
 *   - 409 (slug taken) → inline on the slug field.
 *   - 5xx / network → banner.
 *
 * **Loading.** The submit button is disabled + shows
 * a spinner + "Creating workspace…" while the mutation
 * is in flight.
 */

"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Controller, useForm } from "react-hook-form"

import { Button, Input, Label, Spinner, Text } from "@cortex/ui"

import { useCreateWorkspace } from "@/hooks/onboarding"
import { WORKSPACE_CREATED, track } from "@/lib/analytics"
import { useAuthStore } from "@/lib/auth/store"
import { toFrontendError } from "@/lib/http/errors"
import {
  type WorkspaceSetupInput,
  suggestSlug,
  workspaceSetupSchema,
} from "@/lib/onboarding/workspace.schema"

export interface WorkspaceSetupFormProps {
  /** Where to navigate on success. Default `/app/dashboard`. */
  redirectTo?: string
}

export function WorkspaceSetupForm({
  redirectTo = "/app/dashboard",
}: WorkspaceSetupFormProps = {}) {
  const router = useRouter()
  const setTenant = useAuthStore((s) => s.setTenant)
  const completeOnboarding = useAuthStore((s) => s.completeOnboarding)
  const mutation = useCreateWorkspace()
  const [serverError, setServerError] = useState<string | null>(null)
  // Tracks whether the user has manually edited the slug.
  // While false, the slug auto-syncs from the name.
  const [slugTouched, setSlugTouched] = useState(false)

  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<WorkspaceSetupInput>({
    resolver: zodResolver(workspaceSetupSchema),
    defaultValues: { name: "", slug: "" },
    mode: "onSubmit",
  })

  /**
   * Clean a slug the user is typing — strip anything that
   * isn't a lowercase letter, digit, or dash, but keep the
   * dash in place. We do NOT trim trailing dashes here, so
   * the user can type "my-c" without losing the dash they
   * just typed (the destructive `slugify()` trim would
   * collapse "my-" → "my" and the user can never type a
   * hyphen mid-word). Final validation is the Zod schema
   * on submit.
   */
  function cleanSlugInput(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9-]/g, "")
  }

  async function onSubmit(values: WorkspaceSetupInput) {
    setServerError(null)
    try {
      const tenant = await mutation.mutateAsync(values)
      // 1. Write the new tenant to the auth store.
      setTenant({
        id: tenant.id,
        slug: tenant.slug,
        workspace: tenant.name,
        organization: tenant.organization,
      })
      // 2. Mark onboarding complete.
      completeOnboarding()
      // F10-Part 4: workspace_created fires
      // on the success path. The slug IS
      // included because the analytics
      // cohort analysis needs it (cold
      // signups vs invite signups, etc.)
      // — but no PII, no tenant ID, no
      // user data.
      track(WORKSPACE_CREATED, { source: "signup" })
      // 3. Theme transition (handled by the (app) layout's
      //    ThemeTransition shell — the page just navigates
      //    to it). The transition fires on the `dark` class
      //    being added to <html>, which happens when the
      //    (app) layout mounts.
      // 4. Navigate to the dashboard.
      router.push(redirectTo as never)
    } catch (err) {
      const fe = toFrontendError(err)
      if (fe.fields.length > 0) {
        for (const f of fe.fields) {
          if (f.field === "name" || f.field === "slug") {
            setError(f.field, { type: "server", message: f.message })
          }
        }
      }
      if (fe.status === 409 || /slug/i.test(fe.message)) {
        setError("slug", {
          type: "server",
          message: "That workspace URL is already taken. Try another.",
        })
      } else {
        setServerError(fe.message)
      }
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4"
      aria-label="Create your workspace"
      noValidate
    >
      <div className="space-y-1.5">
        <Label htmlFor="name">Workspace name</Label>
        <Input
          id="name"
          type="text"
          autoComplete="organization"
          placeholder="Acme Inc"
          aria-invalid={errors.name ? "true" : undefined}
          aria-describedby={errors.name ? "name-error" : undefined}
          {...register("name", {
            onChange: (e) => {
              // Auto-sync the slug until the user touches it.
              if (!slugTouched) {
                setValue("slug", suggestSlug(e.target.value))
              }
            },
          })}
        />
        {errors.name ? (
          <p id="name-error" className="text-xs text-destructive">
            {errors.name.message}
          </p>
        ) : null}
      </div>

      <Controller
        control={control}
        name="slug"
        render={({ field }) => (
          <div className="space-y-1.5">
            <Label htmlFor="slug">Workspace URL</Label>
            <div className="flex items-stretch overflow-hidden rounded-md border border-border bg-background focus-within:ring-2 focus-within:ring-ring">
              <span className="flex select-none items-center bg-muted/40 px-3 text-sm text-muted-foreground">
                cortex.dev/
              </span>
              <input
                {...field}
                id="slug"
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="acme-inc"
                onChange={(e) => {
                  setSlugTouched(true)
                  field.onChange(cleanSlugInput(e.target.value))
                }}
                aria-invalid={errors.slug ? "true" : undefined}
                aria-describedby={errors.slug ? "slug-error" : "slug-hint"}
                className="h-10 w-full min-w-0 flex-1 border-0 bg-transparent px-3 text-sm outline-none focus:outline-none focus:ring-0"
              />
            </div>
            {errors.slug ? (
              <p id="slug-error" className="text-xs text-destructive">
                {errors.slug.message}
              </p>
            ) : (
              <Text id="slug-hint" size="xs" tone="muted">
                Lowercase letters, numbers, and dashes only.
              </Text>
            )}
          </div>
        )}
      />

      {serverError ? (
        <p className="text-sm text-destructive" role="alert">
          {serverError}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={isSubmitting || mutation.isPending}>
        {isSubmitting || mutation.isPending ? (
          <>
            <Spinner size="sm" />
            <span>Creating workspace…</span>
          </>
        ) : (
          "Create workspace"
        )}
      </Button>
    </form>
  )
}
