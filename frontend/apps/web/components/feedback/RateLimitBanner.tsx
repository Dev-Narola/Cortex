/**
 * RateLimitBanner — the top-of-viewport banner the
 * entire (app) shell shares.
 *
 * **F4 Part 4 (Task 97).** Renders an error-tinted
 * Slate strip across the top of the main column
 * when the rate-limit store is non-empty.
 *
 * **Mounted in (app) layout** so every
 * authenticated screen shows the same banner
 * (the spec is explicit: "Don't create a
 * Chat-specific rate-limit visual").
 *
 * **Auto-dismiss.** When the store has an
 * `until` epoch (set from the server's
 * `Retry-After` header), the banner sets a
 * `setTimeout` to clear itself when the
 * window expires. The user can also dismiss
 * manually via the X button.
 *
 * **No layout shift.** The banner is absolutely
 * positioned at the top of the main column so
 * the content underneath doesn't reflow when
 * it appears / disappears.
 *
 * **Accessibility.** `role="alert"`,
 * `aria-live="assertive"` (the throttle is
 * time-sensitive), explicit `aria-label` on
 * the dismiss button.
 *
 * **Reduced motion (Task 106).** The slide-in
 * uses a 200ms transition. The `prefers-
 * reduced-motion` query in the UI package's
 * globals suppresses it; we don't add a
 * per-component override.
 */

"use client"

import { useEffect, useState, type ReactNode } from "react"

import { Button, Icon, cn } from "@cortex/ui"

import { useRateLimitStore } from "@/hooks/system/rateLimitStore"

export interface RateLimitBannerProps {
  className?: string
}

export function RateLimitBanner({
  className,
}: RateLimitBannerProps): ReactNode {
  const message = useRateLimitStore((s) => s.message)
  const retryAfterMs = useRateLimitStore((s) => s.retryAfterMs)
  const until = useRateLimitStore((s) => s.until)
  const dismiss = useRateLimitStore((s) => s.dismiss)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

  // Live countdown. The banner re-renders once
  // a second while we have a `until`. When the
  // window expires, the store auto-clears via
  // the effect below.
  useEffect(() => {
    if (until === null) {
      setSecondsLeft(null)
      return
    }
    const untilMs = until
    function tick() {
      const left = Math.max(0, Math.ceil((untilMs - Date.now()) / 1000))
      setSecondsLeft(left)
      if (left <= 0) dismiss()
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [until, dismiss])

  if (!message) return null

  return (
    <div
      role="alert"
      aria-live="assertive"
      data-rate-limit-banner
      className={cn(
        "sticky top-14 z-20 flex items-center gap-3 border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-foreground",
        "transition-[opacity,transform] duration-200",
        className,
      )}
    >
      <Icon
        name="CircleAlert"
        className="h-4 w-4 shrink-0 text-destructive"
        aria-hidden
      />
      <div className="flex flex-1 flex-col">
        <span className="font-medium">{message}</span>
        {secondsLeft !== null && secondsLeft > 0 ? (
          <span className="text-xs text-muted-foreground">
            Try again in {secondsLeft}s
          </span>
        ) : null}
      </div>
      {retryAfterMs !== null && secondsLeft === null ? (
        <span className="text-xs text-muted-foreground">
          Retry in {Math.ceil(retryAfterMs / 1000)}s
        </span>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={dismiss}
        aria-label="Dismiss rate-limit banner"
        className="h-7 w-7"
      >
        <Icon name="X" className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
