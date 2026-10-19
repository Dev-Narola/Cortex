/**
 * ConversationHeader — the title bar at the top of the chat screen.
 *
 * Shows the server-owned title ("New conversation" until the first message
 * renames it). On mobile, where the history pane is hidden, it also carries
 * the conversation list (a left drawer reusing `ConversationHistory`) and a
 * "New" button; on desktop the history pane owns both.
 */

"use client"

import { usePathname, useRouter } from "next/navigation"
import { type ReactNode, useEffect, useState } from "react"

import { Button, Drawer, DrawerContent, DrawerTitle, Icon, toast } from "@cortex/ui"

import { useCreateConversation } from "@/hooks/chat"

import { ConversationHistory } from "./history/ConversationHistory"

export interface ConversationHeaderProps {
  /** Conversation title (server-owned). `null` = new conversation. */
  title?: string | null
}

export function ConversationHeader({ title }: ConversationHeaderProps): ReactNode {
  const router = useRouter()
  const pathname = usePathname()
  const create = useCreateConversation()
  const [navigating, setNavigating] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  // Picking a conversation navigates; close the drawer when the route changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger
  useEffect(() => setHistoryOpen(false), [pathname])

  async function onNewConversation() {
    if (create.isPending || navigating) return
    setNavigating(true)
    try {
      const conversation = await create.mutateAsync({ title: "New conversation" })
      router.push(`/chat/${conversation.id}` as never)
    } catch (err) {
      toast({
        title: "Couldn't start a new conversation",
        description: err instanceof Error ? err.message : "Try again in a moment.",
        variant: "destructive",
      })
      setNavigating(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="-ml-2 md:hidden"
        onClick={() => setHistoryOpen(true)}
        aria-label="Show conversations"
      >
        <Icon name="PanelLeft" className="h-4 w-4" />
      </Button>
      <div className="min-w-0 flex-1">
        <h1
          className="truncate font-display text-base font-semibold tracking-tight text-foreground sm:text-lg"
          title={title ?? "New conversation"}
        >
          {title ?? "New conversation"}
        </h1>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="md:hidden"
        onClick={onNewConversation}
        disabled={create.isPending || navigating}
        aria-label="Start a new conversation"
      >
        <Icon name="Plus" className="h-3.5 w-3.5" />
        <span>New</span>
      </Button>

      <Drawer open={historyOpen} onOpenChange={setHistoryOpen}>
        <DrawerContent
          side="left"
          aria-describedby={undefined}
          className="w-80 max-w-[85vw] gap-0 p-0 md:hidden"
        >
          <DrawerTitle className="sr-only">Conversations</DrawerTitle>
          <ConversationHistory className="border-r-0" onNavigate={() => setHistoryOpen(false)} />
        </DrawerContent>
      </Drawer>
    </div>
  )
}
