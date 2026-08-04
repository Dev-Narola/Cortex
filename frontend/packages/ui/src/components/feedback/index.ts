/**
 * Feedback — barrel for toasts, spinners, skeletons,
 * tooltips, and other "system talking to the user" primitives.
 *
 * Re-exported by `@cortex/ui`; never imported directly by app code.
 *
 * `Badge` used to live here; it moved to `data-display/` per
 * the F1 Part 2 spec (it reads as read-only data, not as
 * a transient feedback surface).
 */

export {
  type ToastActionElement,
  type ToastProps,
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  toast,
  useToast,
} from "./Toast"

export { Skeleton, type SkeletonProps, type SkeletonVariant } from "./Skeleton"
export { Spinner, type SpinnerProps, type SpinnerSize } from "./Spinner"
export {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  type TooltipRootProps,
} from "./Tooltip"
