/**
 * FormItem — the spacing container for a single field.
 *
 * **F1 Part 4 (Task 35).** Pure layout: a vertical stack
 * with consistent gap (8px). Wraps the label / control /
 * description / message so spacing is consistent across
 * every form in the app.
 *
 * **No state.** FormItem is layout-only; the field's
 * state lives in the `FormField` context.
 */

import { type HTMLAttributes, forwardRef } from "react"

import { cn } from "../../utils/cn"

export interface FormItemProps extends HTMLAttributes<HTMLDivElement> {}

const FormItem = forwardRef<HTMLDivElement, FormItemProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col gap-1.5", className)} {...props} />
))
FormItem.displayName = "FormItem"

export { FormItem }
