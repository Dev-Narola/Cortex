/**
 * DialogDescription — accessible modal description.
 *
 * **F1 Part 3 (Task 22).** Renders as a `<p>`. Radix wires
 * this to `aria-describedby` on the content root so screen
 * readers announce the description after the title.
 *
 * **Style.** `text-sm text-muted-foreground` — secondary
 * tone so the description reads as supporting text under
 * the title.
 */

"use client"

import * as DialogPrimitive from "@radix-ui/react-dialog"
import { type ComponentPropsWithoutRef, type ElementRef, forwardRef } from "react"

import { cn } from "../../utils/cn"

const DialogDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export { DialogDescription }
