/**
 * Feedback — barrel for toasts, alerts, badges, and other
 * "system talking to the user" primitives.
 *
 * Re-exported by `@cortex/ui`; never imported directly by app code.
 *
 * F1 ships `Badge` + `Toast`. `Alert`, `Skeleton`, and
 * `EmptyState` land in later parts of F1.
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

export { Badge, badgeVariants, type BadgeProps } from "./Badge"
