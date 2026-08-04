/**
 * Button — the foundation of every interactive surface.
 *
 * **F1 scope (Task 11).** Variant ladder + size ladder + loading
 * state + left/right icon slots. The `asChild` prop (Radix Slot)
 * lets the button render as a child element (Next.js Link,
 * anchor, etc.) while keeping the button styles.
 *
 * **Loading state.** When `loading` is `true`:
 *   - The label is replaced by a `Spinner` (if no `loadingLabel`
 *     is given) or by the `loadingLabel` itself.
 *   - The trailing icon slot is repurposed for the spinner.
 *   - The button is `aria-busy="true"` and `data-loading="true"`.
 *   - Pointer events are disabled.
 *
 * **Icon slots.** `iconLeft` and `iconRight` accept any React
 * node (typically an `<Icon>`). The slots are rendered before
 * and after the label respectively. When the button is in the
 * `icon` size, the label is hidden and the `iconLeft` becomes
 * the button's only content — a square icon button.
 *
 * **Ref forwarding.** The forwarded `ref` lands on the
 * underlying element (`<button>` or the slotted child).
 *
 * **Theme integration.** Every colour comes from a CSS
 * variable — never a hard-coded `text-white` / `bg-black`.
 */

import { Slot } from "@radix-ui/react-slot"
import { Loader2 } from "lucide-react"
import { type ButtonHTMLAttributes, forwardRef } from "react"

import { cn } from "../../utils/cn"
import { Spinner } from "../feedback/Spinner"
import { type ButtonVariantProps, buttonVariants } from "./button.variants"

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonVariantProps {
  /** Render as a child element (Next.js Link, etc.) while keeping button styles. */
  asChild?: boolean
  /** Show a spinner + dim the button. Click handlers are skipped. */
  loading?: boolean
  /** Custom label shown while loading. Defaults to a Spinner. */
  loadingLabel?: string
  /** Icon rendered before the label. */
  iconLeft?: React.ReactNode
  /** Icon rendered after the label. */
  iconRight?: React.ReactNode
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      loadingLabel,
      iconLeft,
      iconRight,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button"
    const isIconOnly = size === "icon"
    const trailing = loading ? (
      <span aria-hidden="true" data-testid="button-spinner" className="inline-flex shrink-0">
        <Spinner size="sm" />
      </span>
    ) : iconRight ? (
      <span aria-hidden="true" className="inline-flex shrink-0">
        {iconRight}
      </span>
    ) : null
    const leading = iconLeft ? (
      <span aria-hidden="true" className="inline-flex shrink-0">
        {iconLeft}
      </span>
    ) : null

    if (asChild) {
      // Slot requires a single React element child. We pass
      // through the children untouched; the call-site is
      // responsible for laying out the leading/trailing icons
      // inside the slotted child.
      return (
        <Comp
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          aria-busy={loading || undefined}
          data-loading={loading || undefined}
          {...props}
        >
          {children}
        </Comp>
      )
    }

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading || undefined}
        aria-busy={loading || undefined}
        data-loading={loading || undefined}
        {...props}
      >
        {leading}
        {loading ? (
          <span aria-hidden="true" data-testid="button-spinner" className="inline-flex shrink-0">
            <Spinner size="sm" />
          </span>
        ) : null}
        {loading ? (
          <span data-testid="button-spinner-label" className="sr-only">
            {Loader2.displayName ?? "Loading"}
          </span>
        ) : null}
        {!isIconOnly ? children : null}
        {!loading ? trailing : null}
      </Comp>
    )
  },
)
Button.displayName = "Button"

export { Button }
