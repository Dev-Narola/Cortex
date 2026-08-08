/**
 * ConversationHeader — the title bar at the top of
 * the chat screen.
 *
 * **F4 Part 1 (Task 9).** For Part 1 the header
 * shows:
 *   - Conversation title (or "New conversation" when
 *     no id is present).
 *   - "New conversation" button → POSTs a new
 *     conversation + navigates to /chat/{id}.
 *
 * **What is intentionally missing.** Rename,
 * delete, conversation history all belong to F5.
 * Per the spec we deliberately do not ship them in
 * Part 1.
 *
 * **Title fallbacks.** The backend's `POST
 * /conversations` requires a non-empty title. For
 * Part 1 we send a fixed placeholder ("New
 * conversation"); Part 2 will rewrite the title
 * from the first message (or the server can
 * auto-rename). The header displays whatever the
 * server returned.
 */

"use client"

import { useRouter } from "next/navigation"
import { useState, type ReactNode } from "react"

import { Button, Icon, toast } from "@cortex/ui"

import { useCreateConversation } from "@/hooks/chat"

export interface ConversationHeaderProps {
  /** Conversation title (server-owned). When `null`,
   *  the header is in "new conversation" mode and
   *  shows the default copy. */
  title?: string | null
}

export function ConversationHeader({
  title,
}: ConversationHeaderProps): ReactNode {
  const router = useRouter()
  const create = useCreateConversation()
  const [navigating, setNavigating] = useState(false)

  async function onNewConversation() {
    if (create.isPending || navigating) return
    setNavigating(true)
    try {
      const conversation = await create.mutateAsync({
        title: "New conversation",
      })
      router.push(`/app/chat/${conversation.id}` as never)
    } catch (err) {
      toast({
        title: "Couldn't start a new conversation",
        description:
          err instanceof Error ? err.message : "Try again in a moment.",
        variant: "destructive",
      })
      setNavigating(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur sm:px-6">
      <div className="min-w-0 flex-1">
        <h1
          className="truncate font-display text-lg font-semibold tracking-tight text-foreground"
          title={title ?? "New conversation"}
        >
          {title ?? "New conversation"}
        </h1>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onNewConversation}
        disabled={create.isPending || navigating}
        aria-label="Start a new conversation"
      >
        <Icon name="Plus" className="h-3.5 w-3.5" />
        <span>New</span>
      </Button>
    </div>
  )
}
