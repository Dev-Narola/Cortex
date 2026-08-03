/**
 * Input — the standard text field primitive.
 *
 * **F1 scope.** Forwarded ref so form libraries (React Hook
 * Form) can attach focus management + validation. Styling is
 * opt-in via `className`; the layout is owned by the parent
 * (label + helper + error live outside the field for
 * accessibility).
 *
 * **Theme integration.** `bg-background`, `text-foreground`,
 * `border-input` — every colour token, never hardcoded.
 */

import { type InputHTMLAttributes, forwardRef } from "react"

import { cn } from "../../utils/cn"

export type InputProps = InputHTMLAttributes<HTMLInputElement>

const Input = forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
      "file:border-0 file:bg-transparent file:text-sm file:font-medium",
      "placeholder:text-muted-foreground",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
))
Input.displayName = "Input"

export { Input }
