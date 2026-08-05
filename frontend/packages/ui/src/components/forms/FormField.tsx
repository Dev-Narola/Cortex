/**
 * FormField — the root of a single form field's composition tree.
 *
 * **F1 Part 4 (Task 35).** Wraps a `<FormItem>` (or any
 * children) and binds them together via the
 * `FormFieldContext`. Pair it with `FormItem` /
 * `FormLabel` / `FormControl` / `FormDescription` /
 * `FormMessage` to compose a labelled, accessible form
 * field without prop drilling.
 *
 * **Compound API.**
 *
 *   <FormField name="email" state="invalid" error="Required">
 *     <FormItem>
 *       <FormLabel>Email</FormLabel>
 *       <FormControl>
 *         <Input type="email" />
 *       </FormControl>
 *       <FormDescription>We'll never share this.</FormDescription>
 *       <FormMessage />
 *     </FormItem>
 *   </FormField>
 *
 * **Framework-agnostic.** The `state` and `error` props
 * are plain values; the app layer wires them to react-hook-form
 * (or whichever form lib the app uses). F1 ships the visual
 * chrome only.
 *
 * **Accessibility.** The `FormField` auto-generates an `id`
 * (from `name` + `useId()`) which is shared with the
 * `FormLabel` (via `htmlFor`), the `FormControl` (via
 * `id` + `aria-describedby`), and the `FormMessage`
 * (via `aria-describedby`).
 */

import type { ReactNode } from "react"

import { FormFieldProvider, type FormFieldState } from "./FormContext"

export interface FormFieldProps {
  /** The field name. Used to auto-generate `id` + label `htmlFor`. */
  name: string
  /** Override the auto-generated id. */
  id?: string
  /** Validation state. When `error` is set, defaults to `"invalid"`. */
  state?: FormFieldState
  /** Error message. */
  error?: string
  /** Description text under the input. */
  description?: string
  /** Drives the `*` indicator on the label. */
  required?: boolean
  children: ReactNode
  className?: string
}

export function FormField({
  name,
  id,
  state,
  error,
  description,
  required,
  children,
  className,
}: FormFieldProps) {
  return (
    <FormFieldProvider
      name={name}
      id={id}
      state={state}
      error={error}
      description={description}
      required={required}
    >
      <div className={className}>{children}</div>
    </FormFieldProvider>
  )
}

FormField.displayName = "FormField"
