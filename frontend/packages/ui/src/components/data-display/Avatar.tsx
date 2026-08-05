"use client"

/**
 * Avatar — user / team / agent / organisation initial.
 *
 * **F1 scope (Task 20).** Image with graceful fallback. If the
 * image fails to load (404, network error, missing `src`),
 * the component renders initials or an icon instead — never
 * a broken `<img>` tag.
 *
 * **Sizes.** `xs` (20), `sm` (28), `md` (40), `lg` (56), `xl` (80).
 * The width/height attributes are always set so the image
 * reserves the right amount of space before it loads.
 *
 * **Initials.** When `name="Ada Lovelace"` we render `AL`. When
 * `name` is missing we fall through to the icon slot.
 *
 * **Theme integration.** `bg-muted` + `text-muted-foreground`
 * for the fallback surface — flips correctly between light
 * and dark. Custom `tone` colours all come from the design
 * tokens.
 */

import { type HTMLAttributes, type ImgHTMLAttributes, forwardRef, useState } from "react"

import { Icon, type IconName } from "../../icons/Icon"
import { cn } from "../../utils/cn"

const SIZES = {
  xs: "h-5 w-5 text-[10px]",
  sm: "h-7 w-7 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-base",
  xl: "h-20 w-20 text-xl",
} as const

const TONES = {
  default: "bg-muted text-muted-foreground",
  primary: "bg-ember-100 text-ember-700",
  accent: "bg-volt-100 text-volt-800",
  inverse: "bg-ink-900 text-paper-50",
} as const

export type AvatarSize = keyof typeof SIZES
export type AvatarTone = keyof typeof TONES

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  /** Image URL. When omitted or failing to load, the fallback renders. */
  src?: string
  /** Accessible label for the avatar (the user's name, the team's name, etc.). */
  name?: string
  /** Initials shown when no image is available. Defaults to the first letter of `name`. */
  fallback?: string
  /** Icon shown when both the image and initials are unavailable. */
  icon?: IconName
  /** Default `md`. */
  size?: AvatarSize
  /** Default `default`. */
  tone?: AvatarTone
  /** Shape. `circle` (default) or `square`. */
  shape?: "circle" | "square"
  /** Optional override for the accessible label. Defaults to `name`. */
  alt?: string
}

const initialsOf = (name: string | undefined): string => {
  if (!name) return ""
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p.charAt(0).toUpperCase()).join("")
}

const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  (
    {
      className,
      src,
      name,
      fallback,
      icon = "User",
      size = "md",
      tone = "default",
      shape = "circle",
      alt,
      ...props
    },
    ref,
  ) => {
    const [errored, setErrored] = useState(false)
    const showImage = src && !errored
    const initials = fallback ?? initialsOf(name)
    const a11y = alt ?? name ?? "Avatar"
    const shapeClass = shape === "circle" ? "rounded-full" : "rounded-md"
    return (
      <div
        ref={ref}
        role="img"
        aria-label={a11y}
        className={cn(
          "relative inline-flex shrink-0 items-center justify-center overflow-hidden font-medium select-none",
          SIZES[size],
          TONES[tone],
          shapeClass,
          className,
        )}
        {...props}
      >
        {showImage ? (
          <img
            src={src}
            alt={a11y ?? ""}
            onError={() => setErrored(true)}
            className={cn("h-full w-full object-cover", shapeClass)}
          />
        ) : initials ? (
          <span aria-hidden="true">{initials}</span>
        ) : (
          <Icon name={icon} size={size} aria-hidden />
        )}
      </div>
    )
  },
)
Avatar.displayName = "Avatar"

export { Avatar }

// Re-export ImgHTMLAttributes for downstream consumers that want
// the strict image prop typing.
export type { ImgHTMLAttributes }
