/**
 * QuickActions — the dashboard's "Quick Actions" row.
 *
 * **F3 Part 1 (Task 8) + F4 Part 1 (Task 18).** Three
 * tiles: Upload Document (live), Ask Cortex (live —
 * lands in F4 Part 1), Create Agent (coming soon).
 * The F4+ versions of these will wire to real
 * navigation + modals.
 *
 * **Responsive.** Renders as a 1-up on mobile, 2-up
 * on small, 3-up on large. The F1 `Card` primitive
 * already accepts Tailwind's grid utilities via
 * `className` so we just supply the right classes
 * here.
 *
 * **Upload trigger.** The Upload card navigates to
 * `/app/documents` (F3 Part 2 wires the real upload
 * modal there).
 *
 * **Ask Cortex trigger.** Navigates to `/app/chat`
 * where the empty state + input await the user's
 * first question. The submission flow itself
 * arrives in F4 Part 2.
 */

"use client"

import { useRouter } from "next/navigation"
import type { ReactNode } from "react"

import { toast } from "@cortex/ui"

import { QuickActionCard } from "./QuickActionCard"

export function QuickActions(): ReactNode {
  const router = useRouter()

  function onUpload() {
    toast({
      title: "Document upload",
      description: "Heading to Documents so you can drop a file.",
    })
    router.push("/app/documents" as never)
  }

  function onAsk() {
    router.push("/app/chat" as never)
  }

  return (
    <section aria-label="Quick actions" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <QuickActionCard
        title="Upload Document"
        description="Drop a PDF, Markdown, or plain-text file. Cortex chunks, embeds, and indexes it."
        icon="Upload"
        actionLabel="Upload"
        onAction={onUpload}
      />
      <QuickActionCard
        title="Ask Cortex"
        description="Ask anything about your indexed documents. Answers are grounded and source-cited."
        icon="Sparkles"
        actionLabel="Ask"
        onAction={onAsk}
      />
      <QuickActionCard
        title="Create Agent"
        description="Multi-step tool-calling agents that talk to your stack via MCP."
        icon="Bot"
        actionLabel="Create"
        variant="coming-soon"
      />
    </section>
  )
}
