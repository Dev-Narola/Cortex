/**
 * FormLabel — the accessible label for a form field.
 *
 * **F1 Part 4 (Task 35).** Renders a `<label>` whose
 * `htmlFor` is auto-bound to the parent `FormField`'s id.
 * Shows a `*` indicator when the field is `required`.
 *
 * **Visual variants.** Two styles:
 *   - `default` — bold label for primary fields.
 *   - `muted` — lighter tone for inline / sub-form labels.
 *
 * **Styling.** Wraps the base `<Label>` primitive so all
 * the design-system label tweaks (required indicator,
 * peer-disabled state) are inherited.
 */

import { type ComponentPropsWithoutRef, type ElementRef, forwardRef } from "react"

import { cn } from "../../utils/cn"
import { useFormFieldContext } from "./FormContext"
import { Label } from "./label/Label"

export type FormLabelTone = "default" | "muted"

const TONE = {
  default: "font-medium",
  muted: "text-muted-foreground",
} as const

export interface FormLabelProps extends ComponentPropsWithoutRef<typeof Label> {
  /** Default `default`. `muted` is for inline / sub-form labels. */
  tone?: FormLabelTone
}

const FormLabel = forwardRef<ElementRef<typeof Label>, FormLabelProps>(
  ({ className, tone = "default", children, ...props }, ref) => {
    const field = useFormFieldContext("FormLabel")
    return (
      <Label ref={ref} htmlFor={field.id} className={cn(TONE[tone], className)} {...props}>
        {children}
        {field.required ? (
          <span aria-hidden="true" className="ml-0.5 text-destructive">
            *
          </span>
        ) : null}
      </Label>
    )
  },
)
FormLabel.displayName = "FormLabel"

export { FormLabel }
