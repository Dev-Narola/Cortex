/**
 * ChatView — the client half of `/chat`.
 *
 * **F4 Part 1 (Task 14).** Composes the chat
 * module: the layout + the message list + the
 * input. No conversation id yet, so:
 *   - The header renders "New conversation" + the
 *     New button (the header itself calls
 *     `useCreateConversation` and navigates).
 *   - The message list is empty (the `ChatEmptyState`
 *     inside `MessageList` is shown).
 *   - The input is wired with a no-op submit — Part 2
 *     replaces the handler with the real POST + WS
 *     flow.
 *
 * **No polling, no fake assistant responses.** Per
 * the spec, Part 1 is foundation only.
 */

"use client"

import { useCallback, type ReactNode } from "react"

import { toast } from "@cortex/ui"

import { ChatLayout } from "@/components/chat/ChatLayout"

export function ChatView(): ReactNode {
  const handleSend = useCallback((value: string) => {
    // Part 1: the input is exercisable but the
    // send is a placeholder. We toast so the
    // user sees the value registered, and we
    // don't navigate (the new-conversation flow
    // lives in the header's "New" button).
    toast({
      title: "Message ready",
      description: `“${value}” — sending lands in F4 Part 2.`,
    })
  }, [])

  return (
    <ChatLayout
      title={null}
      messages={[]}
      onSend={handleSend}
    />
  )
}
