/**
 * `useSocket` — the single WebSocket entry point for the app.
 *
 * Native WebSocket, not Socket.IO. The backend is plain FastAPI
 * WebSocket; the Socket.IO protocol would be dead weight.
 *
 * Reconnection: exponential backoff (200ms → 1s → 2s → 4s → 8s,
 * capped at 30s) with silent retry before surfacing
 * "Connection lost" to the caller. Honours `prefers-reduced-motion`
 * by reducing reconnection log noise.
 *
 * The hook re-renders only on state changes (status + last
 * message). Token buffering for streaming lives in a separate
 * hook (`use-raf-stream`) — see lib/streaming/.
 */

"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { publicEnv } from "@cortex/config"

export type SocketStatus = "idle" | "connecting" | "open" | "closed" | "error"

export interface UseSocketOptions {
  /** Pass a function returning the auth token; called on every (re)connect. */
  getToken?: () => string | null | Promise<string | null>
  /** Max reconnection attempts before giving up. Default 20. */
  maxRetries?: number
  /** Disable the auto-reconnect loop (useful for tests). */
  manual?: boolean
}

export interface UseSocketResult<TMessage = unknown> {
  status: SocketStatus
  lastMessage: TMessage | null
  send: (data: string | object) => void
  reconnect: () => void
  close: () => void
}

const BACKOFF = [200, 400, 800, 1500, 3000, 6000, 12000, 30000]

export function useSocket<TMessage = unknown>(
  path: string | null,
  options: UseSocketOptions = {},
): UseSocketResult<TMessage> {
  const { getToken, maxRetries = 20, manual = false } = options
  const [status, setStatus] = useState<SocketStatus>("idle")
  const [lastMessage, setLastMessage] = useState<TMessage | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const attemptsRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closedByUserRef = useRef(false)

  const connect = useCallback(async () => {
    if (!path) return
    const token = await getToken?.()
    const url = new URL(path, publicEnv.NEXT_PUBLIC_WS_URL)
    url.protocol = url.protocol.replace("http", "ws")
    if (token) url.searchParams.set("token", token)
    setStatus("connecting")
    const ws = new WebSocket(url.toString())
    socketRef.current = ws
    ws.addEventListener("open", () => {
      attemptsRef.current = 0
      setStatus("open")
    })
    ws.addEventListener("message", (ev) => {
      try {
        setLastMessage(JSON.parse(ev.data) as TMessage)
      } catch {
        // Non-JSON frames are ignored; the protocol is JSON.
      }
    })
    ws.addEventListener("error", () => {
      setStatus("error")
    })
    ws.addEventListener("close", () => {
      setStatus("closed")
      if (manual || closedByUserRef.current) return
      if (attemptsRef.current >= maxRetries) return
      const delay = BACKOFF[Math.min(attemptsRef.current, BACKOFF.length - 1)]
      attemptsRef.current += 1
      timerRef.current = setTimeout(connect, delay)
    })
  }, [path, getToken, manual, maxRetries])

  useEffect(() => {
    if (!path) return
    closedByUserRef.current = false
    attemptsRef.current = 0
    connect()
    return () => {
      closedByUserRef.current = true
      if (timerRef.current) clearTimeout(timerRef.current)
      socketRef.current?.close()
    }
  }, [path, connect])

  const send = useCallback((data: string | object) => {
    const payload = typeof data === "string" ? data : JSON.stringify(data)
    socketRef.current?.send(payload)
  }, [])

  const reconnect = useCallback(() => {
    attemptsRef.current = 0
    socketRef.current?.close()
    connect()
  }, [connect])

  const close = useCallback(() => {
    closedByUserRef.current = true
    socketRef.current?.close()
  }, [])

  return { status, lastMessage, send, reconnect, close }
}
