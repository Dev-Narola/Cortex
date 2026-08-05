"use client"

/**
 * Form context — the internal store for the form composition
 * primitives.
 *
 * **F1 Part 4 (Task 35).** The form primitives
 * (`FormField`, `FormItem`, `FormLabel`, `FormControl`,
 * `FormDescription`, `FormMessage`) communicate via a
 * shared `FormFieldContext` so a field's `id`, `name`,
 * `aria-describedby`, and `aria-invalid` flow up to the
 * label / message without prop drilling.
 *
 * **Why not react-hook-form directly?** F1's primitives
 * are framework-agnostic — they bind to *any* form lib
 * (RHF, Zod + useState, Final Form, native HTMLFormElement)
 * via the `FormField` `state` prop. The app layer wires
 * RHF's `useFormContext()` into `FormField` at the call
 * site. F1 ships the visual chrome only.
 *
 * **The `id` auto-generation.** When `name` is set and
 * `id` is not, the context auto-generates `cortex-field-{name}`.
 * This matches the Radix pattern and keeps the form
 * accessible (every input has a unique id the label
 * `htmlFor`s to).
 */

import { type ReactNode, createContext, useContext, useId, useMemo } from "react"

export type FormFieldState = "idle" | "valid" | "invalid"

export interface FormFieldContextValue {
  /** Stable id used by the input + label `htmlFor`. */
  id: string
  /** The field name (e.g. "email"). */
  name: string
  /** Current validation state. */
  state: FormFieldState
  /** Error message (when state="invalid"). */
  error?: string
  /** Description text. */
  description?: string
  /** Whether the field is required. Drives the `*` indicator on the label. */
  required?: boolean
}

const FormFieldContext = createContext<FormFieldContextValue | null>(null)

export function useFormFieldContext(component: string): FormFieldContextValue {
  const ctx = useContext(FormFieldContext)
  if (!ctx) {
    throw new Error(
      `<${component}> must be used inside a <FormField>. Wrap the field's children in <FormField name="...">.`,
    )
  }
  return ctx
}

export interface FormFieldProviderProps {
  /** The field name (e.g. `"email"`). Becomes part of the auto id. */
  name: string
  /** Override the auto-generated id. */
  id?: string
  /** Initial / current validation state. Default `idle`. */
  state?: FormFieldState
  /** Error message. Sets `aria-invalid` on the input. */
  error?: string
  /** Description text under the input. */
  description?: string
  required?: boolean
  children: ReactNode
}

/**
 * Provider — internal; consumers use `<FormField>` instead.
 * Exposed as a separate component so the barrel stays tidy.
 */
export function FormFieldProvider({
  name,
  id,
  state = "idle",
  error,
  description,
  required,
  children,
}: FormFieldProviderProps) {
  const generatedId = useId()
  const resolvedId = id ?? `cortex-field-${name || generatedId}`
  const value = useMemo<FormFieldContextValue>(
    () => ({
      id: resolvedId,
      name,
      state: error ? "invalid" : state,
      error,
      description,
      required,
    }),
    [resolvedId, name, state, error, description, required],
  )
  return <FormFieldContext.Provider value={value}>{children}</FormFieldContext.Provider>
}

export { FormFieldContext }
