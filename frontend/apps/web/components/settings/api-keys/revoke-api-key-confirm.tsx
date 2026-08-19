/**
 * RevokeApiKeyConfirm — confirmation dialog before
 * destroying an API key.
 *
 * **F7 Part 2 (Tasks 24, 25).** The spec is
 * explicit: "Don't make revocation happen from
 * a single accidental click." A non-trivial
 * mutation (deletes the auth material for an
 * external integration) always goes through a
 * confirmation step.
 *
 * **The mutation is owned by the parent.** This
 * component is the dialog chrome + the loading
 * state; the parent calls `useRevokeApiKey()` and
 * passes the pending state in. We pass the
 * `pending` flag + the `error` flag so the
 * dialog can render the right affordance (Try
 * again vs Revoke).
 */
"use client"

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
} from "@cortex/ui"

export interface RevokeApiKeyConfirmProps {
  /** Controlled open state. */
  open: boolean
  /** Notifies the parent of open / close. */
  onOpenChange: (open: boolean) => void
  /** The key being revoked — used to render the
   *  human-friendly name in the dialog body. */
  keyName: string | null
  /** True while the revoke mutation is in flight. */
  pending?: boolean
  /** Called when the user confirms. The parent
   *  fires the mutation. */
  onConfirm: () => void
}

export function RevokeApiKeyConfirm({
  open,
  onOpenChange,
  keyName,
  pending = false,
  onConfirm,
}: RevokeApiKeyConfirmProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" data-testid="revoke-api-key-confirm">
        <DialogHeader>
          <DialogTitle>Revoke API key?</DialogTitle>
          <DialogDescription>
            This will immediately invalidate{" "}
            <span className="font-medium text-paper-50">{keyName ?? "this key"}</span>. Any tool
            using it will lose access on the next request.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={pending}
            data-testid="revoke-api-key-cancel"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            disabled={pending}
            data-testid="revoke-api-key-confirm-button"
          >
            {pending ? (
              <>
                <Icon name="RefreshCw" className="h-3.5 w-3.5 animate-spin" />
                <span>Revoking…</span>
              </>
            ) : (
              <>
                <Icon name="X" className="h-3.5 w-3.5" />
                <span>Revoke</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
