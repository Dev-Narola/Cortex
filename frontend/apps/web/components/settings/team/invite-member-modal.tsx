/**
 * InviteMemberModal — invite-by-email dialog.
 *
 * **F7 Part 1 (Tasks 20, 21, 25, 26, 27, 29, 30, 35, 36).**
 * The RHF + Zod invite form. The dialog is
 * controlled (parent owns `open`); the form is
 * local to the modal so the user's input is
 * preserved across re-renders.
 *
 * **State machine.**
 *   - `idle`     — fresh modal, empty form.
 *   - `submitting` — the invite mutation is in
 *     flight; the submit button is disabled and
 *     reads "Inviting…".
 *   - `error`    — the mutation failed. The form
 *     keeps the user's input so they can correct
 *     and retry.
 *   - `success`  — the mutation succeeded. The
 *     modal closes, the team list invalidates,
 *     and a success toast fires.
 *
 * **Error mapping.** The hook returns the raw
 * `ApiError`; the modal duck-types the status
 * and renders a useful message. We deliberately
 * don't surface "raw" stack traces or HTTP codes
 * in the toast — the user wants "what to do
 * next", not a debug page.
 *
 * **Form preservation on error.** A recoverable
 * error (e.g. 422 — invalid email format from
 * the backend, 409 — already a member) keeps the
 * form values intact. The user corrects the
 * field and retries without re-typing.
 *
 * **Backend gap.** Like `TeamPanel`, the mutation
 * targets `POST /users/invite` which is not
 * currently exposed by the backend. The flow
 * is fully functional the moment the route
 * ships.
 */
"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect } from "react"
import { useForm } from "react-hook-form"

import {
  Button,
  Icon,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@cortex/ui"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@cortex/ui"

import { useInviteMember } from "@/hooks/team"
import { toFrontendError } from "@/lib/http/errors"
import { toast } from "@cortex/ui"

import {
  INVITABLE_ROLES,
  type InviteMemberFormValues,
  inviteMemberSchema,
} from "./invite-member-schema"

const ROLE_LABELS: Record<(typeof INVITABLE_ROLES)[number], string> = {
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
}

export interface InviteMemberModalProps {
  /** Controlled open state. */
  open: boolean
  /** Notifies the parent of open / close. */
  onOpenChange: (open: boolean) => void
  /**
   * Imperative close handler. The parent uses this
   * for "close after success" or "close on backdrop
   * click". We separate it from `onOpenChange` so
   * the parent can react to "closed by us" (e.g. to
   * clear a temp state) vs "closed by Radix".
   */
  onClose?: () => void
}

export function InviteMemberModal({ open, onOpenChange, onClose }: InviteMemberModalProps) {
  const invite = useInviteMember()

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<InviteMemberFormValues>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { email: "", role: "member" },
  })

  // Reset the form whenever the modal re-opens
  // (so a previous "Inviting…" submission doesn't
  // leak into the next attempt). A successful
  // mutation also clears the form.
  useEffect(() => {
    if (open) reset({ email: "", role: "member" })
  }, [open, reset])

  const currentRole = watch("role")

  async function onSubmit(values: InviteMemberFormValues) {
    try {
      const result = await invite.mutateAsync({ email: values.email, role: values.role })
      const name = result.member.full_name || result.member.email
      toast({
        title: "Invitation sent",
        description: `${name} will receive an email to join your workspace.`,
        variant: "success",
      })
      onOpenChange(false)
      onClose?.()
    } catch (err) {
      const fe = toFrontendError(err)
      // Map common backend errors to inline form
      // errors so the user knows what to fix.
      // 422 → server-side validation; bind the
      //   message to the email field unless the
      //   message names a specific field.
      // 403 → the user lost admin rights between
      //   page load and submit; surface as a
      //   banner-level error.
      // 409 → the email is already a member; bind
      //   to the email field.
      // Anything else → banner.
      const status = (err as { status?: number }).status
      if (status === 409) {
        setError("email", { message: "That email is already a member of this workspace." })
        return
      }
      if (status === 422) {
        setError("email", { message: fe.message || "Enter a valid email address." })
        return
      }
      toast({
        title: "Unable to send the invitation",
        description: fe.message || "Please try again in a moment.",
        variant: "destructive",
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" data-testid="invite-member-modal">
        <DialogHeader>
          <DialogTitle>Invite teammate</DialogTitle>
          <DialogDescription>
            Send an email invitation to join your Cortex workspace. The invitee will receive a
            sign-up link with the role you choose.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
          noValidate
          data-testid="invite-member-form"
        >
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              autoComplete="email"
              placeholder="teammate@company.com"
              aria-invalid={Boolean(errors.email)}
              data-testid="invite-email-input"
              {...register("email")}
            />
            {errors.email ? (
              <p className="text-xs text-destructive" role="alert" data-testid="invite-email-error">
                {errors.email.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <Select
              value={currentRole}
              onValueChange={(value) => {
                // The form state is typed as the
                // schema's union; the Select only
                // emits one of the three valid values.
                setValue("role", value as InviteMemberFormValues["role"], {
                  shouldValidate: true,
                })
              }}
            >
              <SelectTrigger id="invite-role" aria-label="Role" data-testid="invite-role-trigger">
                <SelectValue placeholder="Choose a role" />
              </SelectTrigger>
              <SelectContent>
                {INVITABLE_ROLES.map((role) => (
                  <SelectItem key={role} value={role} data-testid={`invite-role-option-${role}`}>
                    {ROLE_LABELS[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.role ? (
              <p className="text-xs text-destructive" role="alert" data-testid="invite-role-error">
                {errors.role.message}
              </p>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onOpenChange(false)
                onClose?.()
              }}
              disabled={isSubmitting}
              data-testid="invite-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={isSubmitting}
              data-testid="invite-submit"
            >
              {isSubmitting ? (
                <>
                  <Icon name="RefreshCw" className="h-3.5 w-3.5 animate-spin" />
                  <span>Inviting…</span>
                </>
              ) : (
                <>
                  <Icon name="Mail" className="h-3.5 w-3.5" />
                  <span>Invite</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
