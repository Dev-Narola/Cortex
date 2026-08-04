/**
 * Dialog — accessible modal built on Radix.
 *
 * **F1 Part 3 (Task 22).** The root primitive. App code does:
 *
 *   <Dialog>
 *     <DialogTrigger>Open</DialogTrigger>
 *     <DialogContent size="lg">
 *       <DialogHeader>
 *         <DialogTitle>Title</DialogTitle>
 *         <DialogDescription>Description</DialogDescription>
 *       </DialogHeader>
 *       <DialogFooter>
 *         <Button>Cancel</Button>
 *         <Button>Confirm</Button>
 *       </DialogFooter>
 *     </DialogContent>
 *   </Dialog>
 *
 * **Accessibility.** Radix handles the focus trap, Escape
 * dismissal, scroll locking, ARIA roles, initial focus, and
 * focus restoration. We add a portal so the modal escapes
 * any parent stacking context.
 *
 * **Sub-parts.** Each compound part lives in its own file in
 * this folder (per the F1 spec):
 *   - `DialogHeader.tsx`
 *   - `DialogContent.tsx`
 *   - `DialogFooter.tsx`
 *   - `DialogTitle.tsx`
 *   - `DialogDescription.tsx`
 */

"use client"

import * as DialogPrimitive from "@radix-ui/react-dialog"

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close
const DialogOverlay = DialogPrimitive.Overlay

export { Dialog, DialogClose, DialogOverlay, DialogPortal, DialogTrigger }
