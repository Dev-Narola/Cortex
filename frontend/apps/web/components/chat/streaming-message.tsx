/**
 * Streaming message bubble.
 *
 * Wires the WebSocket to the rAF stream buffer. Tokens arrive
 * continuously; the bubble updates at most once per frame so
 * a long response renders smoothly even on a slow device.
 */

"use client"

import { useEffect } from "react"

import { useSocket } from "@/lib/socket/use-socket"
import { useRafStream } from "@/lib/streaming/use-raf-stream"

interface StreamMessage {
  type: "token" | "done" | "error"
  content?: string
  message?: string
}

export function StreamingMessage({
  conversationId,
  getToken,
}: {
  conversationId: string
  getToken: () => string | null
}) {
  const path = `/ws/conversations/${conversationId}`
  const { lastMessage, status } = useSocket<StreamMessage>(path, { getToken })
  const { text, append, reset } = useRafStream()

  useEffect(() => {
    if (!lastMessage) return
    if (lastMessage.type === "token" && lastMessage.content) {
      append(lastMessage.content)
    } else if (lastMessage.type === "done") {
      // Final flush — anything still in the buffer.
      reset()
    } else if (lastMessage.type === "error") {
      // Surface via a toast in the parent; here we just stop.
      reset()
    }
  }, [lastMessage, append, reset])

  return (
    <div className="space-y-2">
      <div className="whitespace-pre-wrap text-sm">{text}</div>
      {status === "connecting" && (
        <div className="text-xs text-muted-foreground">Reconnecting…</div>
      )}
      {status === "error" && (
        <div className="text-xs text-destructive">Connection lost. Trying to resume…</div>
      )}
    </div>
  )
}
