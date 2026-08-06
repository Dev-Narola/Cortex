/**
 * DashboardView — the client-rendered view of the dashboard.
 *
 * Kept separate from `page.tsx` so the page can be a server
 * entry (no build-time pre-render of `useAuthStore`).
 */

"use client"

import { Card, CardContent, EmptyState, Heading, Text } from "@cortex/ui"

import { useAuthStore } from "@/lib/auth/store"

export function DashboardView() {
  const tenant = useAuthStore((s) => s.tenant)
  const user = useAuthStore((s) => s.user)
  const workspaceName = tenant?.workspace ?? tenant?.slug ?? "your workspace"

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-1">
        <Heading level="h1">Welcome to Cortex</Heading>
        <Text tone="muted">
          {user?.email ? <>Signed in as {user.email}. </> : null}
          Your workspace is ready.
        </Text>
      </header>

      <Card>
        <CardContent className="pt-6">
          <EmptyState
            title="No documents yet"
            description={`Start exploring ${workspaceName} by uploading your first PDF, Markdown, or text file.`}
            actionLabel="Upload your first document"
            onAction={() => {
              // F3 wires the upload modal. For now this
              // is a placeholder CTA so the dashboard
              // has a clear primary action.
            }}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <HintCard
          title="Upload documents"
          body="PDFs, Markdown, or plain text. Cortex chunks, embeds, and indexes them automatically."
        />
        <HintCard
          title="Ask questions"
          body="Once your documents are indexed, ask anything in natural language. Answers cite their sources."
        />
        <HintCard
          title="Build the knowledge graph"
          body="Cortex connects entities across your documents into a graph you can explore visually."
        />
      </div>
    </div>
  )
}

function HintCard({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 pt-6">
        <Heading level="h3" size="sm">
          {title}
        </Heading>
        <Text size="sm" tone="muted">
          {body}
        </Text>
      </CardContent>
    </Card>
  )
}
