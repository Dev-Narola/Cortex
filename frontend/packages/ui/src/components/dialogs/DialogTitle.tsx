/**
 * DialogTitle — accessible modal title.
 *
 * **F1 Part 3 (Task 22).** Renders as an `<h2>` by default.
 * Radix wires this to `aria-labelledby` on the content root
 * so screen readers announce the title when the modal opens.
 *
 * **Custom element.** Pass `asChild` to render a different
 * element (e.g. a `<div>` inside a custom header).
 */

"use client"

import * as DialogPrimitive from "@radix-ui/react-dialog"
import { type ComponentPropsWithoutRef, type ElementRef, forwardRef } from "react"

import { cn } from "../../utils/cn"

const DialogTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

export { DialogTitle }
