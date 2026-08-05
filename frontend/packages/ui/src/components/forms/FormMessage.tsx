/**
 * FormMessage — the validation message under a form field.
 *
 * **F1 Part 4 (Task 35).** Renders the field's error
 * (from context) or, if no error is set, the
 * `children` fallback. Uses `id={fieldId}-message` so
 * the parent `FormControl` wires `aria-describedby` to
 * it. AT users hear the error announced as soon as the
 * field becomes invalid.
 *
 * **Live region.** The wrapper has `aria-live="polite"`
 * so the message is announced as it appears (rather than
 * waiting for the next focus).
 *
 * **Tone.** The colour flips from `text-muted-foreground`
 * to `text-destructive` when the field is in the
 * `"invalid"` state. The icon (a small alert triangle)
 * is added when an error is present.
 */

import { AlertCircle } from "lucide-react"
import { type HTMLAttributes, forwardRef } from "react"

import { cn } from "../../utils/cn"
import { useFormFieldContext } from "./FormContext"

export interface FormMessageProps extends HTMLAttributes<HTMLParagraphElement> {
  /** Override the auto-resolved message (when not pulling from context). */
  children?: React.ReactNode
}

const FormMessage = forwardRef<HTMLParagraphElement, FormMessageProps>(
  ({ className, children, ...props }, ref) => {
    const field = useFormFieldContext("FormMessage")
    const body = children ?? field.error
    if (!body) return null
    const isInvalid = field.state === "invalid"
    return (
      <p
        ref={ref}
        id={`${field.id}-message`}
        role={isInvalid ? "alert" : undefined}
        aria-live="polite"
        className={cn(
          "flex items-center gap-1 text-xs",
          isInvalid ? "text-destructive" : "text-muted-foreground",
          className,
        )}
        {...props}
      >
        {isInvalid ? <AlertCircle className="h-3 w-3 shrink-0" aria-hidden /> : null}
        <span>{body}</span>
      </p>
    )
  },
)
FormMessage.displayName = "FormMessage"

export { FormMessage }
