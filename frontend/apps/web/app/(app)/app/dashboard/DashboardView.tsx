/**
 * DashboardView — the empty-state dashboard surface.
 *
 * **F3 Part 1 (Task 7).** The first screen a new
 * workspace owner sees after onboarding.
 *
 * **Content (per spec).**
 *   - Hero: "Welcome to Cortex" + workspace name +
 *     "your workspace is ready" subtitle.
 *   - "Upload your first document" CTA (primary).
 *   - Quick actions row (Task 8): Upload Document (live)
 *     + Search Knowledge + Create Agent (both "Soon").
 *
 * **No dashboard metrics yet.** Per the spec, F3 Part 1
 * is the empty dashboard — document count, search hits,
 * etc. land in F3 Part 2.
 *
 * **No tenant guard here.** The tenant check lives in
 * the (app) layout (which redirects to /workspace-setup
 * if the store has no tenant). This page assumes
 * `tenant` is populated and reads it for the welcome
 * line + the workspace name.
 *
 * **Client component.** The auth store is client-only;
 * the page reads `useAuthStore` for the tenant. Kept
 * separate from `page.tsx` (a server entry) so the
 * build doesn't try to pre-render the auth store at
 * build time.
 */

"use client"

import { useRouter } from "next/navigation"

import { Button, Card, CardContent, Heading, Text, toast } from "@cortex/ui"

import { QuickActions } from "@/components/dashboard/QuickActions"
import { useAuthStore } from "@/lib/auth/store"

export function DashboardView() {
  const router = useRouter()
  const tenant = useAuthStore((s) => s.tenant)
  const user = useAuthStore((s) => s.user)
  const workspaceName = tenant?.workspace ?? tenant?.slug ?? "your workspace"

  function onUpload() {
    toast({
      title: "Document upload",
      description: "Uploads open in F3 Part 2. Heading to Documents for now.",
    })
    router.push("/app/documents" as never)
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      {/* Hero. */}
      <header className="space-y-2">
        <Heading level="h1">Welcome to Cortex</Heading>
        <Text tone="muted" size="lg">
          {user?.email ? <>Signed in as {user.email}. </> : null}
          Your workspace is ready.
        </Text>
      </header>

      {/* Empty state card — the primary CTA. */}
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <div
            aria-hidden
            className="flex h-14 w-14 items-center justify-center rounded-full bg-ember-500/10 text-ember-600"
          >
            <svg
              className="h-7 w-7"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </div>
          <div className="space-y-1">
            <Heading level="h2" size="lg">
              {workspaceName} is ready
            </Heading>
            <Text tone="muted" className="max-w-md">
              Upload your first document to begin building your knowledge base.
            </Text>
          </div>
          <Button size="lg" onClick={onUpload} className="min-w-[200px]">
            Upload your first document
          </Button>
        </CardContent>
      </Card>

      {/* Quick actions. */}
      <section aria-labelledby="quick-actions-heading" className="space-y-3">
        <Heading id="quick-actions-heading" level="h2" size="md">
          Quick actions
        </Heading>
        <QuickActions />
      </section>
    </div>
  )
}
