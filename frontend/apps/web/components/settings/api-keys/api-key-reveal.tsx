/**
 * ApiKeyReveal — the one-time key display.
 *
 * **F7 Part 2 (Tasks 16-22, 43).** The most
 * security-critical surface in the F7 phase.
 * This is the ONLY place the raw key is shown to
 * the user, and it only ever exists in the
 * parent's transient state.
 *
 * **One-time boundary.** When the modal mounts,
 * the parent passes the `ApiKeyCreated` (with
 * `raw_key`). The modal:
 *   1. Renders the raw key in a read-only
 *      `<code>` element in JetBrains Mono.
 *   2. Provides a Copy button (uses the existing
 *      `useClipboard` hook from F4 Part 4).
 *   3. Provides a single "Done" action.
 *   4. On "Done" / close, calls `onClose` so the
 *      parent can clear its `rawKey` state. The
 *      modal itself doesn't store the key outside
 *      its render tree — when it unmounts, the
 *      key is gone from memory.
 *
 * **The key never persists.**
 *   - No `localStorage` / `sessionStorage`.
 *   - No URL query param / route param.
 *   - No TanStack Query cache write.
 *   - No Zustand / React global state.
 *   - No `console.log` in any path.
 *
 * **Clipboard failure.** If the browser refuses
 * clipboard access (older Safari, embedded
 * webviews, denied permission), the modal does
 * NOT hide the key — the user can still select
 * the text manually. A toast surfaces the
 * failure so the user knows why Copy didn't
 * appear to work.
 *
 * **Navigation away.** The parent owns the
 * `rawKey` state; if the user navigates from
 * `/app/settings/api-keys` to `/app/settings/team`
 * with the reveal still open, the unmount +
 * remount path clears the key (the panel re-renders
 * with `rawKey = null` and the reveal never
 * re-opens — the key is gone).
 */
"use client"

import { useEffect } from "react"

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  toast,
} from "@cortex/ui"

import { useClipboard } from "@/components/chat/useClipboard"
import type { ApiKeyCreated } from "@/services/api-keys"

export interface ApiKeyRevealProps {
  /** Controlled open state. */
  open: boolean
  /**
   * The newly created key (with `raw_key`).
   * The modal treats this as the **one and only**
   * source of truth for the secret — when the
   * user closes the modal the parent should
   * drop this prop (set it to `null`).
   */
  created: ApiKeyCreated | null
  /** Called when the user clicks "Done" or
   *  otherwise closes the reveal. The parent
   *  must clear its `rawKey` state on this
   *  signal. */
  onClose: () => void
}

export function ApiKeyReveal({ open, created, onClose }: ApiKeyRevealProps) {
  const clipboard = useClipboard()

  // Clear the clipboard's success / error pill
  // whenever the modal closes — a stale "Copied"
  // pill from a previous reveal would be
  // misleading on the next open.
  useEffect(() => {
    if (!open) clipboard.reset()
  }, [open, clipboard])

  // The modal is meaningless without a created
  // key. If the parent forgets to clear `created`
  // before opening the modal, the open transition
  // would render an empty state — guard against
  // that by treating "no created" as "not open".
  const showOpen = open && created !== null

  async function handleCopy() {
    if (!created) return
    await clipboard.copy(created.raw_key)
    if (clipboard.state === "success") {
      toast({
        title: "Copied to clipboard",
        description:
          "Paste the key into your integration. You won't be able to view it again here.",
        variant: "success",
      })
    } else if (clipboard.state === "error") {
      toast({
        title: "Unable to copy the API key",
        description: "Select the text in the field above and copy it manually with Ctrl+C / Cmd+C.",
        variant: "destructive",
      })
    }
  }

  function handleOpenChange(next: boolean) {
    // Radix fires `onOpenChange(false)` when the
    // user hits Escape or clicks the overlay.
    // Either way, the parent must clear the
    // raw key — `onClose` is the "I'm done with
    // the secret" signal.
    if (!next) onClose()
  }

  function handleDone() {
    onClose()
  }

  return (
    <Dialog open={showOpen} onOpenChange={handleOpenChange}>
      <DialogContent size="md" data-testid="api-key-reveal-modal">
        <DialogHeader>
          <DialogTitle>API key generated</DialogTitle>
          <DialogDescription>
            Copy this key now. For security reasons, we won&apos;t show it again — the list only
            displays a masked representation after this dialog closes.
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="space-y-3" data-testid="api-key-reveal-body">
            <div className="rounded-md border border-slate-700 bg-slate-900/60 p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-paper-200/50">
                {created.name}
              </p>
              {/* The raw key. The font-mono utility
                  pulls JetBrains Mono from the
                  Tailwind theme (per the UI spec's
                  "Mono" token). `select-all` lets
                  the user triple-click to select the
                  whole key as a fallback. */}
              <code
                data-testid="api-key-reveal-value"
                className="block break-all font-mono text-sm text-paper-50 select-all"
              >
                {created.raw_key}
              </code>
            </div>
            <p className="text-xs text-paper-200/60">
              Store this key in your secret manager or CI configuration. Anyone with this key can
              authenticate as your tenant.
            </p>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            disabled={!created}
            data-testid="api-key-reveal-copy"
          >
            {clipboard.state === "success" ? (
              <>
                <Icon name="Check" className="h-3.5 w-3.5" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Icon name="Copy" className="h-3.5 w-3.5" />
                <span>Copy</span>
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleDone}
            disabled={!created}
            data-testid="api-key-reveal-done"
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
