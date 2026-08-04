/**
 * Label — accessible form label.
 *
 * **F1 scope (Task 14).** Built on Radix so screen readers
 * announce the field correctly even when the label is
 * visually hidden. Always pair with a control that has the
 * matching `id`.
 *
 * **Required indicator.** When `required` is set, the label
 * renders a visible `*` after the children so the user can
 * see which fields are required without reading helper
 * copy. The indicator is decorative — the `required`
 * attribute on the underlying control is the source of
 * truth for screen readers.
 *
 * **Disabled state.** The label automatically dims when
 * the control it labels is disabled (via the
 * `peer-disabled` variant on the underlying Radix root).
 *
 * **Never manually style labels on pages.** This component
 * is the only place a label's typography + spacing lives.
 */

"use client"

import * as LabelPrimitive from "@radix-ui/react-label"
import { type ComponentPropsWithoutRef, type ElementRef, type ReactNode, forwardRef } from "react"

import { cn } from "../../../utils/cn"

export interface LabelProps extends ComponentPropsWithoutRef<typeof LabelPrimitive.Root> {
  /** Marks the field as required (adds a `*` indicator). */
  required?: boolean
  /** Optional helper text under the label. */
  description?: ReactNode
}

const Label = forwardRef<ElementRef<typeof LabelPrimitive.Root>, LabelProps>(
  ({ className, required, description, children, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      <LabelPrimitive.Root
        ref={ref}
        className={cn(
          "flex items-center gap-1 text-sm font-medium leading-none text-foreground",
          "peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
          className,
        )}
        {...props}
      >
        {children}
        {required ? (
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
        ) : null}
      </LabelPrimitive.Root>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
    </div>
  ),
)
Label.displayName = "Label"

export { Label }
