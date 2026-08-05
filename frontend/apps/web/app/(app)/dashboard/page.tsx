"use client"

import Link from "next/link"

import { Card, CardContent, EmptyState, Heading, Spinner, Text } from "@cortex/ui"

import { useSessionRestore } from "@/hooks/auth/useSessionRestore"
import { useAuthStore } from "@/lib/auth/store"

export default function DashboardPage() {
  const hydrated = useAuthStore((s) => s.hydrated)
  const tenant = useAuthStore((s) => s.tenant)
  const user = useAuthStore((s) => s.user)
  const { isRestoring } = useSessionRestore()

  if (!hydrated || isRestoring) {
    return (
      <output
        className="flex min-h-[400px] items-center justify-center"
        aria-live="polite"
      >
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Spinner size="lg" />
          <p className="text-sm">Bootstrapping dashboard…</p>
        </div>
      </output>
    )
  }

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

      <div className="flex items-center justify-end">
        <Link
          href={"/app" as never}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Back
        </Link>
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
