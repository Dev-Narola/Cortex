/**
 * QuickActions — the dashboard's "Quick Actions" row.
 *
 * **F3 Part 1 (Task 8).** Three tiles: Upload Document
 * (live), Search Knowledge (coming soon), Create Agent
 * (coming soon). The F4+ versions of these will wire
 * to real navigation + modals; for now the layout is
 * the deliverable.
 *
 * **Responsive.** Renders as a 1-up on mobile, 2-up
 * on small, 3-up on large. The F1 `Card` primitive
 * already accepts Tailwind's grid utilities via
 * `className` so we just supply the right classes
 * here.
 *
 * **Upload trigger.** The Upload card opens a
 * stub callback that surfaces a toast — F3 Part 2
 * wires this to the real upload modal.
 */

"use client"

import { useRouter } from "next/navigation"
import type { ReactNode } from "react"

import { toast } from "@cortex/ui"

import { QuickActionCard } from "./QuickActionCard"

export function QuickActions(): ReactNode {
  const router = useRouter()

  function onUpload() {
    // F3 Part 2 wires the real upload modal. For now
    // we route the user to Documents so they have
    // somewhere to go.
    toast({
      title: "Document upload",
      description: "Uploads open in F3 Part 2. Heading to Documents for now.",
    })
    router.push("/app/documents" as never)
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
        title="Search Knowledge"
        description="Hybrid BM25 + vector search across your entire workspace."
        icon="Search"
        actionLabel="Search"
        variant="coming-soon"
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
