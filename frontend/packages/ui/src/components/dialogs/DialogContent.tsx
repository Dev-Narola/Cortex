/**
 * DialogContent — the modal surface itself.
 *
 * **F1 Part 3 (Task 22).** Renders the overlay + content
 * inside a portal. Supports the `size` axis (sm / md / lg /
 * xl / fullscreen) via the `dialogContentVariants` cva
 * config. Adds a default close button in the top-right
 * (X icon) — pass `showClose={false}` to opt out for
 * confirmation dialogs that need the Cancel/Confirm path.
 *
 * **Animations.** Uses `data-[state=open]` / `data-[state=closed]`
 * for the Radix state machine; the `tailwindcss-animate` plugin
 * provides the `animate-in` / `animate-out` utilities.
 */

"use client"

import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { type ComponentPropsWithoutRef, type ElementRef, forwardRef } from "react"

import { cn } from "../../utils/cn"
import { type DialogContentVariantProps, dialogContentVariants } from "./dialog.variants"

export interface DialogContentProps
  extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    DialogContentVariantProps {
  /** Show the top-right X close button. Default `true`. */
  showClose?: boolean
}

const DialogContent = forwardRef<ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(
  ({ className, children, size, showClose = true, ...props }, ref) => (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          "fixed inset-0 z-50 bg-ink-950/60 backdrop-blur-sm",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        )}
      />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          dialogContentVariants({ size }),
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  ),
)
DialogContent.displayName = DialogPrimitive.Content.displayName

export { DialogContent }
