/**
 * `useRafStream` — coalesces incoming WebSocket tokens into a
 * single per-frame state update.
 *
 * Tokens arrive faster than 60fps in practice; updating React
 * on every token causes the message bubble to thrash. We
 * buffer the pending append and flush it inside
 * `requestAnimationFrame`, which the browser guarantees will
 * run once per repaint.
 *
 * Honours `prefers-reduced-motion` by falling back to
 * `setTimeout(0)` — the animation frame rate is irrelevant when
 * the user has disabled motion, and rAF can be throttled in
 * background tabs.
 */

"use client"

import { useEffect, useRef, useState } from "react"

export function useRafStream(): {
  text: string
  append: (token: string) => void
  reset: () => void
} {
  const [text, setText] = useState("")
  const bufferRef = useRef("")
  const scheduledRef = useRef(false)

  const flush = () => {
    scheduledRef.current = false
    if (!bufferRef.current) return
    setText((prev) => prev + bufferRef.current)
    bufferRef.current = ""
  }

  const schedule = () => {
    if (scheduledRef.current) return
    scheduledRef.current = true
    if (typeof window === "undefined") return
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
    if (reduce) {
      setTimeout(flush, 0)
    } else {
      requestAnimationFrame(flush)
    }
  }

  const append = (token: string) => {
    if (!token) return
    bufferRef.current += token
    schedule()
  }

  const reset = () => {
    bufferRef.current = ""
    setText("")
  }

  useEffect(() => {
    return () => {
      bufferRef.current = ""
    }
  }, [])

  return { text, append, reset }
}
