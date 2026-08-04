/**
 * Dialogs — barrel for Dialog + compound parts.
 *
 * Re-exported by `@cortex/ui`; never imported directly by app code.
 *
 * **F1 Part 3 (Task 22).** Compound API mirroring Radix's
 * root primitive: `Dialog` (root), `DialogTrigger`,
 * `DialogContent`, `DialogHeader`, `DialogTitle`,
 * `DialogDescription`, `DialogFooter`, `DialogClose`.
 *
 * **Sizes.** `DialogContent` accepts a `size` axis
 * (`sm | md | lg | xl | fullscreen`).
 *
 * **Used by.** Upload, Delete Confirmation, API Keys,
 * Team Invite, Billing, Settings.
 */

export { Dialog, DialogClose, DialogOverlay, DialogPortal, DialogTrigger } from "./Dialog"
export { type DialogContentProps, DialogContent } from "./DialogContent"
export { DialogHeader } from "./DialogHeader"
export { DialogFooter } from "./DialogFooter"
export { DialogTitle } from "./DialogTitle"
export { DialogDescription } from "./DialogDescription"
export {
  dialogContentVariants,
  type DialogContentVariantProps,
} from "./dialog.variants"
