/**
 * StreamingMessage — the live assistant bubble
 * during a token-by-token stream.
 *
 * **F4 Part 2 (Tasks 20, 22, 23).** This
 * component is rendered in place of a normal
 * `MessageBubble` while a turn is in flight.
 * It reads the accumulator from the
 * conversation stream store and:
 *
 *   - Renders the partial content with a
 *     subtle streaming cursor.
 *   - Applies the "Spark Glow" treatment:
 *     a soft, breathing radial gradient
 *     behind the bubble. The glow settles
 *     flat when the turn completes.
 *   - Falls back to a normal `MessageBubble`
 *     once the server-authoritative row is
 *     in the cache (i.e. the conversation
 *     query has been invalidated +
 *     refetched by `useInvalidateOnStreamComplete`).
 *
 * **Why a separate component, not a flag on
 * MessageBubble.** The Spark Glow is a layout-
 * level treatment (absolute-positioned pseudo-
 * element behind the bubble) — it's a
 * fundamentally different visual. Keeping it
 * isolated means the rest of the message
 * styles stay cheap (no per-render conditional
 * class strings).
 *
 * **The cursor (Task 23).** A single `▌`
 * glyph appended to the accumulator. The
 * glyph disappears when the store transitions
 * to `completed` (the user message is no
 * longer "active").
 *
 * **The Spark Glow (Task 22).** A soft Volt
 * radial gradient that breathes via Tailwind's
 * `animate-pulse` while `isStreaming` is
 * true. When the turn completes the
 * `data-streaming` attribute drops + the
 * keyframe animation pauses, leaving the
 * bubble flat. The intensity is deliberately
 * subtle — the spec calls out a calm,
 * authenticated workspace, not a fireworks
 * display.
 */

import { type ReactNode } from "react"

import { cn } from "@cortex/ui"

import { MessageBubble } from "./MessageBubble"
import type { Message } from "@/types/conversation"

export interface StreamingMessageProps {
  /**
   * The accumulator so far (joined `token`
   * events). Empty when the WS has just
   * accepted the send but no `message_start`
   * has arrived yet — in that case the
   * component renders a subtle "Generating…"
   * placeholder.
   */
  content: string
  /** True while the store is `streaming` or
   *  `sending` (i.e. active). Drives the
   *  cursor + the Spark Glow animation. */
  isActive: boolean
  /**
   * Optional final message to fall back to
   * once the turn completes. The component
   * hands the rendering off to a normal
   * `MessageBubble` when this is set + the
   * stream is no longer active.
   */
  finalMessage?: Message | null
  className?: string
}

export function StreamingMessage({
  content,
  isActive,
  finalMessage,
  className,
}: StreamingMessageProps): ReactNode {
  // When the server-authoritative row is
  // available AND the stream is no longer
  // active, render a normal bubble. This
  // is the moment the Spark Glow drops.
  if (!isActive && finalMessage) {
    return <MessageBubble message={finalMessage} className={className} />
  }

  // Active state: render the accumulator
  // (or a "Generating…" placeholder if no
  // token has arrived yet).
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
      {/* Spark Glow — a soft Volt radial
          gradient behind the bubble. The
          element is always present; the
          animation only runs while the data
          attribute is "true". */}
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
        {content || (isActive ? "" : "")}
        {isActive ? (
          <span
            aria-hidden="true"
            className="ml-0.5 inline-block h-3 w-1.5 translate-y-0.5 animate-pulse bg-volt-500/80"
          />
        ) : null}
      </p>
    </article>
  )
}
