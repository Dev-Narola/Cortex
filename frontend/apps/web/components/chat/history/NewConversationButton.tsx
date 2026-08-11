/**
 * NewConversationButton — the "+ New Chat" CTA
 * at the top of the history panel.
 *
 * **F5 Part 1 (Task 13).** Reuses the F4
 * `useCreateConversation` mutation. The F4
 * `ConversationHeader` already has a "Start a
 * new conversation" button; this component is
 * the same flow re-skinned for the history
 * pane. The shared mutation means Part 2's
 * rename + Part 3's archive can invalidate
 * the list once and the panel refreshes
 * automatically.
 *
 * **The flow.**
 *   Click
 *     ↓
 *   `useCreateConversation.mutate({title})`
 *     ↓
 *   POST /conversations
 *     ↓
 *   onSuccess → router.push(`/chat/{id}`)
 *
 * **Loading state.** The button shows a
 * spinner + "New chat…" while the mutation
 * is pending and disables itself to prevent
 * double-submits. The `useCreateConversation`
 * mutation already does an `isPending` check
 * internally as a second line of defence.
 *
 * **No title strategy here.** Part 1 sends the
 * placeholder "New conversation" (matching the
 * F4 flow). Part 2 will revisit this when we
 * add the rename surface + auto-rename-from-
 * first-message.
 */

"use client"

import { useRouter } from "next/navigation"
import { useCallback, type ReactNode } from "react"

import { Button, Icon, Spinner } from "@cortex/ui"

import { useCreateConversation } from "@/hooks/chat"

export interface NewConversationButtonProps {
  /**
   * Title sent to the backend. Defaults to
   * "New conversation" (matches the F4
   * `ConversationHeader` flow). Override for
   * test fixtures or future auto-generation.
   */
  title?: string
  /**
   * Callback fired when the create succeeds
   * AND the navigation is about to happen. The
   * parent can use this to dismiss the mobile
   * drawer before the route transition.
   */
  onAfterCreate?: () => void
  variant?: "default" | "outline" | "ghost"
  size?: "sm" | "md"
  className?: string
}

export function NewConversationButton({
  title = "New conversation",
  onAfterCreate,
  variant = "default",
  size = "sm",
  className,
}: NewConversationButtonProps): ReactNode {
  const router = useRouter()
  const create = useCreateConversation()

  const handleClick = useCallback(async () => {
    if (create.isPending) return
    try {
      const conversation = await create.mutateAsync({ title })
      onAfterCreate?.()
      // The route group `(app)` doesn't add a
      // URL segment — `/chat/{id}` is the
      // canonical F4 path.
      router.push(`/chat/${conversation.id}` as never)
    } catch {
      // The mutation already surfaces a toast
      // via the consumer (the F4 create hook
      // returns the Error to the caller). We
      // intentionally swallow here so the
      // button doesn't double-handle the
      // failure. The history panel remains
      // open + the user can retry.
    }
  }, [create, title, onAfterCreate, router])

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={() => {
        void handleClick()
      }}
      disabled={create.isPending}
      aria-busy={create.isPending}
      data-new-conversation
      className={className}
    >
      {create.isPending ? (
        <>
          <Spinner size="sm" aria-hidden className="h-3.5 w-3.5" />
          <span>New chat…</span>
        </>
      ) : (
        <>
          <Icon name="Plus" className="h-3.5 w-3.5" aria-hidden />
          <span>New chat</span>
        </>
      )}
    </Button>
  )
}
