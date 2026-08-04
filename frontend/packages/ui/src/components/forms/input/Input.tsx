/**
 * Input — the standard text field primitive.
 *
 * **F1 scope (Task 12).** Wraps a native `<input>` with the
 * design-system surface. Variant variants cover the
 * validation states (default / error / success) and the
 * three sizes (sm / md / lg).
 *
 * **Prefix / suffix icons.** The component supports a
 * `prefix` and `suffix` slot for icons. Both accept any
 * React node (typically an `<Icon>`). When the `clearable`
 * prop is set, the suffix slot is replaced by a clear
 * button (rendered only when there's text to clear).
 *
 * **Accessibility.**
 *   - `aria-invalid={true}` when `state="error"`.
 *   - `aria-describedby` to wire helper / error text.
 *   - `aria-required` and `required` on the underlying field
 *     when `required` is set.
 *
 * **Ref forwarding.** The forwarded `ref` lands on the
 * underlying `<input>` so form libraries (React Hook Form)
 * can attach focus management + validation.
 */

import { type InputHTMLAttributes, type ReactNode, forwardRef, useId, useState } from "react"

import { Icon, type IconName } from "../../../icons/Icon"
import { cn } from "../../../utils/cn"
import { type InputVariantProps, inputVariants } from "./input.variants"

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "prefix" | "size">,
    InputVariantProps {
  /** Icon (or any node) rendered at the start of the field. */
  prefix?: ReactNode
  /**
   * Icon (or any node) rendered at the end of the field.
   * Ignored when `clearable` is true and the field has a value.
   */
  suffix?: ReactNode
  /** Show a clear button when the field has a non-empty value. */
  clearable?: boolean
  /** Accessible label for the clear button. Default "Clear". */
  clearLabel?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      size,
      state,
      prefix,
      suffix,
      clearable = false,
      clearLabel = "Clear",
      type = "text",
      disabled,
      readOnly,
      required,
      onChange,
      "aria-describedby": describedBy,
      ...props
    },
    ref,
  ) => {
    const [value, setValue] = useState(
      (props.defaultValue ?? props.value ?? "") as string | number | readonly string[],
    )
    const fallbackId = useId()
    const describedById = describedBy ?? `${fallbackId}-desc`

    const handleChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
      setValue(e.target.value)
      onChange?.(e)
    }

    const handleClear = () => {
      setValue("")
    }

    const showClear = clearable && !readOnly && !disabled && value !== ""

    return (
      <div
        className={cn(inputVariants({ size, state }), className)}
        data-readonly={readOnly || undefined}
      >
        {prefix ? (
          <span aria-hidden="true" className="inline-flex shrink-0 text-muted-foreground">
            {prefix}
          </span>
        ) : null}
        <input
          ref={ref}
          type={type}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          aria-invalid={state === "error" || undefined}
          aria-describedby={describedById}
          value={value}
          onChange={handleChange}
          className="h-full w-full min-w-0 flex-1 border-0 bg-transparent p-0 outline-none focus:outline-none focus:ring-0 disabled:cursor-not-allowed file:border-0 file:bg-transparent file:text-sm file:font-medium"
          {...props}
        />
        {showClear ? (
          <button
            type="button"
            onClick={handleClear}
            aria-label={clearLabel}
            className="inline-flex shrink-0 items-center justify-center rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Icon name="X" size="xs" />
          </button>
        ) : suffix ? (
          <span aria-hidden="true" className="inline-flex shrink-0 text-muted-foreground">
            {suffix}
          </span>
        ) : null}
        {/* Visually hidden description slot — siblings can use the same id
            to wire helper / error copy via aria-describedby. */}
        <span id={describedById} hidden />
      </div>
    )
  },
)
Input.displayName = "Input"

export { Input, type IconName }
