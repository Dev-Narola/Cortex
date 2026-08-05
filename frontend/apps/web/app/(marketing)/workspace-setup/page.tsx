/**
 * Workspace Setup — `/workspace-setup`.
 *
 * **F2 Part 2 (Task 11).** Onboarding step 1. Visible
 * to authenticated users who don't yet have a tenant.
 * The (marketing) layout provides the basic page
 * shell; this page adds the workspace-setup chrome.
 *
 * **Routing rules** (per the spec):
 *   - Authenticated + tenant exists → redirect to /app.
 *   - Authenticated + no tenant → render the form.
 *   - Unauthenticated → redirect to /login.
 *
 * **Theme.** Stays in the marketing (light) theme until
 * the workspace is created. Task 18 wires the
 * light → dark transition; it fires when the (app)
 * layout mounts (after the form submits successfully),
 * not here.
 *
 * **Suspense.** `useAuthStore` + `useRouter` don't need a
 * Suspense boundary today; the form owns its own loading
 * state via the mutation.
 */

"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

import {
  WorkspaceSetupForm,
  WorkspaceSetupLayout,
} from "@/components/onboarding"
import { ProgressIndicator } from "@/components/onboarding/ProgressIndicator"
import { useAuthStore } from "@/lib/auth/store"

export default function WorkspaceSetupPage() {
  const router = useRouter()
  const hydrated = useAuthStore((s) => s.hydrated)
  const isAuthed = useAuthStore((s) => s.isAuthenticated())
  const hasTenant = useAuthStore((s) => s.hasTenant())

  useEffect(() => {
    if (!hydrated) return
    if (!isAuthed) {
      router.replace(
        `/login?next=${encodeURIComponent("/workspace-setup")}` as never,
      )
      return
    }
    if (hasTenant) {
      router.replace("/app" as never)
    }
  }, [hydrated, isAuthed, hasTenant, router])

  // While the store rehydrates, render the layout (it
  // shows the "loading" state by default; the redirect
  // effect will fire once hydration completes).
  return (
    <WorkspaceSetupLayout
      progress={<ProgressIndicator currentStep={1} totalSteps={1} />}
      title="Welcome to Cortex"
      description="Let's set up your workspace. You can change these details later."
      footer={
        <>
          Already onboarded?{" "}
          <a
            href={"/app" as never}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Go to your dashboard
          </a>
        </>
      }
    >
      <WorkspaceSetupForm />
    </WorkspaceSetupLayout>
  )
}
