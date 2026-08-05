/**
 * FormControl — the slot that wraps the actual input.
 *
 * **F1 Part 4 (Task 35).** Renders a `<div>` with the
 * correct ARIA wiring (`id`, `aria-describedby`,
 * `aria-invalid`) so any child input (or custom widget)
 * becomes accessible automatically. The wrapper uses
 * Radix `Slot` to merge the props onto the child — the
 * input itself doesn't need to know about FormField.
 *
 * **Use any input.** The control is a passthrough;
 * `<FormControl><Input /></FormControl>`,
 * `<FormControl><Textarea /></FormControl>`, or even
 * `<FormControl><MyCustomSelect /></FormControl>` all
 * work. The custom widget must forward the `id` and
 * `aria-describedby` onto its underlying input for the
 * wiring to apply.
 */

import { Slot } from "@radix-ui/react-slot"
import { type HTMLAttributes, type ReactNode, forwardRef } from "react"

import { cn } from "../../utils/cn"
import { useFormFieldContext } from "./FormContext"

export interface FormControlProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Render as a Radix `Slot` so the ARIA wiring merges onto
   * the child input rather than wrapping it in a `<div>`.
   * Required when the consumer wants the field's id /
   * aria-describedby to land directly on the input element.
   */
  asChild?: boolean
  children: ReactNode
}

const FormControl = forwardRef<HTMLDivElement, FormControlProps>(
  ({ asChild = true, className, children, ...props }, ref) => {
    const field = useFormFieldContext("FormControl")
    const isInvalid = field.state === "invalid"
    const describedBy =
      [
        field.description ? `${field.id}-description` : null,
        field.error ? `${field.id}-message` : null,
      ]
        .filter(Boolean)
        .join(" ") || undefined

    if (asChild) {
      return (
        <Slot
          id={field.id}
          aria-describedby={describedBy}
          aria-invalid={isInvalid || undefined}
          aria-required={field.required || undefined}
          data-state={field.state}
        >
          {children}
        </Slot>
      )
    }

    return (
      <div
        ref={ref}
        className={cn(className)}
        id={field.id}
        aria-describedby={describedBy}
        aria-invalid={isInvalid || undefined}
        data-state={field.state}
        {...props}
      >
        {children}
      </div>
    )
  },
)
FormControl.displayName = "FormControl"

export { FormControl }
