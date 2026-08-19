/**
 * GenerateApiKeyModal — the form for creating a new
 * API key.
 *
 * **F7 Part 2 (Tasks 10-12, 14, 31).** RHF + Zod,
 * single `name` field, controlled `open` state.
 *
 * **The modal is a thin wrapper around the
 * mutation.** The actual key generation + the
 * one-time reveal happen in `ApiKeysPanel`:
 * this modal only collects the name + fires the
 * mutation, then hands the resolved
 * `ApiKeyCreated` (with `raw_key`) to the parent
 * via the `onCreated` callback. The parent is
 * the only place that holds the raw key — the
 * modal never stores it.
 *
 * **State machine.**
 *   - `idle`     — fresh modal, empty form.
 *   - `submitting` — the mutation is in flight;
 *     the submit button is disabled and reads
 *     "Generating…".
 *   - `error`    — the mutation failed. The form
 *     keeps the user's input so they can correct
 *     and retry. (Task 30 — form preservation.)
 *
 * **Why no inline scope picker.** The spec is
 * explicit: Tasks 10-12 describe a single-name
 * form. The backend defaults `scopes` to `[]`,
 * so a Part 2 hardening pass can add the picker
 * without a contract change.
 */
"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect } from "react"
import { useForm } from "react-hook-form"

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  Input,
  Label,
} from "@cortex/ui"

import { useCreateApiKey } from "@/hooks/api-keys"
import { toFrontendError } from "@/lib/http/errors"
import { toast } from "@cortex/ui"

import { type GenerateApiKeyFormValues, generateApiKeySchema } from "./generate-api-key-schema"

export interface GenerateApiKeyModalProps {
  /** Controlled open state. */
  open: boolean
  /** Notifies the parent of open / close. */
  onOpenChange: (open: boolean) => void
  /**
   * Called when the mutation succeeds. Receives
   * the `ApiKeyCreated` (with `raw_key`). The
   * parent uses this to drive the one-time
   * reveal modal. The raw key never enters
   * this component's local state.
   */
  onCreated?: (created: import("@/services/api-keys").ApiKeyCreated) => void
}

export function GenerateApiKeyModal({ open, onOpenChange, onCreated }: GenerateApiKeyModalProps) {
  const create = useCreateApiKey()

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<GenerateApiKeyFormValues>({
    resolver: zodResolver(generateApiKeySchema),
    defaultValues: { name: "" },
  })

  // Reset the form whenever the modal re-opens
  // (so a previous failed submission doesn't
  // leak into the next attempt). A successful
  // mutation also clears the form.
  useEffect(() => {
    if (open) reset({ name: "" })
  }, [open, reset])

  async function onSubmit(values: GenerateApiKeyFormValues) {
    try {
      const result = await create.mutateAsync({ name: values.name })
      onCreated?.(result)
      // The parent owns the modal-close decision
      // (it opens the reveal modal right after).
      // We do NOT close here — the panel decides.
    } catch (err) {
      const fe = toFrontendError(err)
      // 422 (validation) → bind to the name field
      // unless the message names something else.
      // 403 (lost admin) → banner.
      // 5xx / network → banner.
      const status = (err as { status?: number }).status
      if (status === 422) {
        setError("name", { message: fe.message || "Enter a valid name." })
        return
      }
      toast({
        title: "Unable to generate the API key",
        description: fe.message || "Please try again in a moment.",
        variant: "destructive",
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" data-testid="generate-api-key-modal">
        <DialogHeader>
          <DialogTitle>Generate New API Key</DialogTitle>
          <DialogDescription>
            Create a new API key for connecting external tools and services to your Cortex
            workspace. The full key will be shown exactly once — copy it before closing the dialog.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
          noValidate
          data-testid="generate-api-key-form"
        >
          <div className="space-y-1.5">
            <Label htmlFor="api-key-name">Name</Label>
            <Input
              id="api-key-name"
              autoComplete="off"
              placeholder="CI Pipeline"
              aria-invalid={Boolean(errors.name)}
              data-testid="api-key-name-input"
              {...register("name")}
            />
            {errors.name ? (
              <p className="text-xs text-destructive" role="alert" data-testid="api-key-name-error">
                {errors.name.message}
              </p>
            ) : null}
            <p className="text-xs text-paper-200/50">
              A friendly label so you remember what this key is for.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              data-testid="api-key-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={isSubmitting}
              data-testid="api-key-submit"
            >
              {isSubmitting ? (
                <>
                  <Icon name="RefreshCw" className="h-3.5 w-5 animate-spin" />
                  <span>Generating…</span>
                </>
              ) : (
                <>
                  <Icon name="KeyRound" className="h-3.5 w-5" />
                  <span>Generate Key</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
