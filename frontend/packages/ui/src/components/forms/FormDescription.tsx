/**
 * FormDescription — supporting text under a form field.
 *
 * **F1 Part 4 (Task 35).** Renders a small `<p>` with
 * `id={fieldId}-description` so the parent `FormControl`
 * can wire `aria-describedby` to it. AT users hear the
 * description announced when the field is focused.
 *
 * **Two purposes.** Sometimes the description is a hint
 * ("At least 8 characters"); sometimes it's a status
 * (the password-strength meter). Both render the same
 * way visually; the app decides the tone via the
 * `tone` prop.
 */

import { type HTMLAttributes, forwardRef } from "react"

import { cn } from "../../utils/cn"
import { useFormFieldContext } from "./FormContext"

export type FormDescriptionTone = "default" | "muted" | "success"

const TONE = {
  default: "text-muted-foreground",
  muted: "text-muted-foreground/80",
  success: "text-success",
} as const

export interface FormDescriptionProps extends Omit<HTMLAttributes<HTMLParagraphElement>, "id"> {
  tone?: FormDescriptionTone
}

const FormDescription = forwardRef<HTMLParagraphElement, FormDescriptionProps>(
  ({ className, tone = "default", children, ...props }, ref) => {
    const field = useFormFieldContext("FormDescription")
    return (
      <p
        ref={ref}
        id={`${field.id}-description`}
        className={cn("text-xs", TONE[tone], className)}
        {...props}
      >
        {children}
      </p>
    )
  },
)
FormDescription.displayName = "FormDescription"

export { FormDescription }
