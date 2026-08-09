/**
 * StreamingMessage — the live assistant bubble
 * during a token-by-token stream.
 *
 * **F4 Part 2 (Tasks 20, 22, 23) + Part 3.**
 * This component is rendered in place of a
 * normal `MessageBubble` while a turn is in
 * flight. It reads the accumulator + the
 * streamed citations from the conversation
 * stream store and:
 *
 *   - Renders the partial content with a
 *     subtle streaming cursor.
 *   - Renders citation chips inline once the
 *     backend has emitted them. F4 Part 3
 *     keeps the chips at the end of the
 *     streaming bubble (rather than inline
 *     in the text) because the V3 stream
 *     doesn't insert `[1]` markers in the
 *     token content; the chips are the
 *     authoritative grounding markers.
 *   - Applies the "Spark Glow" treatment:
 *     a soft, breathing radial gradient
 *     behind the bubble. The glow settles
 *     flat when the turn completes.
 *   - Falls back to a normal `MessageBubble`
 *     once the server-authoritative row is
 *     in the cache.
 *
 * **Why a separate component, not a flag on
 * MessageBubble.** The Spark Glow is a
 * layout-level treatment; keeping it
 * isolated means the rest of the message
 * styles stay cheap.
 *
 * **The cursor (Task 23).** A subtle block
 * appended to the accumulator. Disappears
 * when the store transitions to `completed`.
 *
 * **Citation rendering.** Same data path as
 * `MessageBubble` — both call
 * `useResolvedCitations(message, conversationId)`.
 * For the streaming bubble the "message"
 * shape is synthesised from the store
 * because we don't have a real `Message`
 * row until the server persists it.
 */

import { type ReactNode } from "react"

import { cn } from "@cortex/ui"

import { CitationChip } from "./citations/CitationChip"
import { MessageBubble } from "./MessageBubble"
import { useCitationPanelStore } from "@/hooks/chat"
import { useResolvedCitations } from "@/hooks/chat/useResolvedCitations"

import type { Message } from "@/types/conversation"

export interface StreamingMessageProps {
  /**
   * The accumulator so far (joined `token`
   * events). Empty when the WS has just
   * accepted the send but no `message_start`
   * has arrived yet.
   */
  content: string
  /** True while the store is `streaming` or
   *  `sending`. Drives the cursor + the
   *  Spark Glow animation. */
  isActive: boolean
  /**
   * Conversation id — the citation resolver
   * looks up streamed citations in the
   * per-conversation store.
   */
  conversationId: string
  /**
   * The chunk ids the server has persisted
   * on the assistant message. Empty while
   * the turn is in flight (the server only
   * writes the row on `message_complete`).
   * For the live stream, the resolver
   * falls back to "all streamed citations"
   * so chips appear as soon as the WS
   * delivers the first `citation` envelope.
   */
  retrievedChunkIds: string[]
  /**
   * Optional final message to fall back to
   * once the turn completes. The component
   * hands the rendering off to a normal
   * `MessageBubble` when this is set +
   * the stream is no longer active.
   */
  finalMessage?: Message | null
  className?: string
}

export function StreamingMessage({
  content,
  isActive,
  conversationId,
  retrievedChunkIds,
  finalMessage,
  className,
}: StreamingMessageProps): ReactNode {
  // When the server-authoritative row is
  // available AND the stream is no longer
  // active, render a normal bubble.
  if (!isActive && finalMessage) {
    return (
      <MessageBubble
        message={finalMessage}
        conversationId={conversationId}
        className={className}
      />
    )
  }

  // The bubble always uses the real
  // resolver; the resolver handles the
  // case where the message has no
  // retrievedChunkIds yet by falling back
  // to the streamed list (the
  // `useResolvedCitations` implementation
  // covers that).
  // The streaming bubble doesn't have a
  // real Message yet — we synthesise a
  // minimal one for the resolver's input.
  const synthetic = {
    id: "streaming",
    retrievedChunkIds,
  }
  const { data: citations } = useResolvedCitations(
    synthetic,
    conversationId,
  )
  const selectedCitationId = useCitationPanelStore(
    (s) => s.selectedCitationId,
  )

  return (
    <article
      data-streaming={isActive ? "true" : "false"}
      data-role="assistant"
      aria-label={isActive ? "Assistant is generating a response" : "Assistant message"}
      aria-live={isActive ? "polite" : "off"}
      className={cn(
        "streaming-bubble group relative mr-auto max-w-2xl",
        "rounded-2xl border border-border bg-card px-4 py-2.5 text-foreground",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 -z-10 rounded-2xl",
          "bg-[radial-gradient(120%_120%_at_50%_50%,rgba(124,191,255,0.18),transparent_70%)]",
          "transition-opacity duration-500",
          isActive ? "opacity-100 animate-pulse" : "opacity-0",
        )}
      />
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-foreground/70">
        Assistant
        {isActive ? (
          <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-normal normal-case tracking-normal text-muted-foreground">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-volt-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-volt-500" />
            </span>
            Generating
          </span>
        ) : null}
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
        {content}
        {isActive ? (
          <span
            aria-hidden="true"
            className="ml-0.5 inline-block h-3 w-1.5 translate-y-0.5 animate-pulse bg-volt-500/80"
          />
        ) : null}
      </p>
      {citations.length > 0 ? (
        <div
          className="mt-2 flex flex-wrap items-center gap-1.5"
          data-citation-rail
          data-citation-count={citations.length}
        >
          {citations.map((c) => (
            <CitationChip
              key={c.id}
              id={c.id}
              index={c.index}
              documentTitle={c.documentTitle}
              isActive={selectedCitationId === c.id}
            />
          ))}
        </div>
      ) : null}
    </article>
  )
}
