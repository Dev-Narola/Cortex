/**
 * ChatEmptyState — the "no messages yet" surface for
 * both `/chat` and `/chat/{id}`.
 *
 * **F4 Part 1 (Task 10).** Calm, minimal, dark.
 * The copy is the spec's exact line + a one-sentence
 * subtitle that explains the differentiator (RAG,
 * source-grounded answers).
 *
 * **No action buttons yet.** The New Conversation
 * CTA lives in the `ConversationHeader` (Task 9).
 * This surface is purely informational.
 */

import type { ReactNode } from "react"

import { BoltMark } from "./BoltMark"

export function ChatEmptyState(): ReactNode {
  return (
    <output className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <BoltMark className="h-12 w-12 rounded-2xl shadow-md" />
      <div className="space-y-1.5">
        <h2 className="font-display text-2xl font-medium tracking-[-0.02em] text-foreground">
          Ask anything about your knowledge base
        </h2>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          Cortex can answer questions using your indexed documents and provide source-grounded
          answers.
        </p>
      </div>
    </output>
  )
}
