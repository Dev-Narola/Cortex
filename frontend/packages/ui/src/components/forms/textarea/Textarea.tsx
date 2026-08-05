"use client"

/**
 * Textarea — multi-line text field.
 *
 * **F1 scope (Task 13).** Visually matches `Input` so a form
 * with both reads as one design system. Supports the same
 * states (default / error / success) plus a `resize` axis
 * for the resize handle.
 *
 * **Auto-resize.** Pass `autoResize` to grow the textarea
 * with the content (1 row → N rows as the user types). The
 * component listens to `input` events and sets the height
 * to `scrollHeight`. A `minRows` / `maxRows` clamp prevents
 * the textarea from collapsing or growing infinitely.
 *
 * **Character counter.** `showCount` renders a small
 * `{length}/{maxLength}` indicator at the bottom-right of
 * the field. Requires `maxLength` to be set.
 *
 * **Accessibility.** Same as `Input` — `aria-invalid` +
 * `aria-describedby` + `required` plumbing.
 */

import {
  type TextareaHTMLAttributes,
  forwardRef,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react"

import { cn } from "../../../utils/cn"
import { type TextareaVariantProps, textareaVariants } from "./textarea.variants"

export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "size">,
    TextareaVariantProps {
  /** Grow the field with the content. Default `false`. */
  autoResize?: boolean
  /** Minimum visible rows when auto-resize is on. Default 3. */
  minRows?: number
  /** Maximum visible rows when auto-resize is on. Default 12. */
  maxRows?: number
  /** Show `{length}/{maxLength}` counter at the bottom. */
  showCount?: boolean
}

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      state,
      resize,
      autoResize = false,
      minRows = 3,
      maxRows = 12,
      showCount = false,
      onInput,
      "aria-describedby": describedBy,
      ...props
    },
    ref,
  ) => {
    const innerRef = useRef<HTMLTextAreaElement | null>(null)
    const fallbackId = useId()
    const describedById = describedBy ?? `${fallbackId}-desc`
    const [length, setLength] = useState(
      () => (props.defaultValue ?? props.value ?? "") as string | number | readonly string[],
    )

    // Combine forwarded ref with our internal ref
    const setRefs = (node: HTMLTextAreaElement | null) => {
      innerRef.current = node
      if (typeof ref === "function") ref(node)
      else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node
    }

    useIsomorphicLayoutEffect(() => {
      if (!autoResize || !innerRef.current) return
      const el = innerRef.current
      el.style.height = "auto"
      const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight) || 20
      const min = lineHeight * minRows + 16 // +padding
      const max = lineHeight * maxRows + 16
      el.style.height = `${Math.min(Math.max(el.scrollHeight, min), max)}px`
    }, [length, autoResize, minRows, maxRows])

    const handleInput: React.FormEventHandler<HTMLTextAreaElement> = (e) => {
      setLength(e.currentTarget.value)
      onInput?.(e)
    }

    return (
      <div className={cn(textareaVariants({ state, resize }), className)}>
        <textarea
          ref={setRefs}
          aria-invalid={state === "error" || undefined}
          aria-describedby={describedById}
          rows={minRows}
          onInput={handleInput}
          className="min-h-[2.5rem] w-full flex-1 resize-none border-0 bg-transparent p-0 outline-none focus:outline-none focus:ring-0 disabled:cursor-not-allowed"
          style={{ resize: resize === "none" ? "none" : undefined }}
          {...props}
        />
        {showCount && typeof props.maxLength === "number" ? (
          <span
            aria-live="polite"
            className="ml-auto shrink-0 self-end font-mono text-[10px] text-muted-foreground tabular-nums"
          >
            {String(length).length}/{props.maxLength}
          </span>
        ) : null}
        <span id={describedById} hidden />
      </div>
    )
  },
)
Textarea.displayName = "Textarea"

export { Textarea }
