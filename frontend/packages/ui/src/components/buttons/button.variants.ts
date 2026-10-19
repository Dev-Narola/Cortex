/**
 * Button variants — the `cva` config extracted to its own file.
 *
 * **F1 scope (Task 11).** The split (`button.variants.ts` vs
 * `Button.tsx`) is intentional: every component that "expects
 * to grow" gets the variants file so a future contributor can
 * scan the design system at a glance without opening the
 * component body.
 *
 * **Variants.** `primary` (default), `secondary`, `outline`,
 * `ghost`, `destructive`, `link`. These are the user-facing
 * names from the F1 spec; we also export `default` as an alias
 * for `primary` so callers can do `<Button>` without a variant
 * and get the same thing.
 *
 * **Sizes.** `sm`, `md`, `lg`, `icon`. `icon` is square (no
 * horizontal padding) for icon-only buttons.
 *
 * **States.** Built into the variant ladder: `:hover` (every
 * variant), `:active` (translate-y-[1px] on press), `:focus-visible`
 * (the brand ring), `:disabled` (pointer-events-none + 50% opacity).
 * Loading state is component-level (replaces the label, dims
 * the button) — not a variant — so the click handler can be
 * disabled without forking the variant space.
 *
 * **Theme integration.** Every colour comes from a CSS variable
 * (`--ink-900`, `--paper-50`, etc.) — never `text-white` /
 * `bg-black` — so the component is theme-agnostic out of the box.
 */

import { type VariantProps, cva } from "class-variance-authority"

export const buttonVariants = cva(
  [
    // Base — every button
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-fast ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "active:scale-[0.98]",
    "disabled:pointer-events-none disabled:opacity-50",
    "data-[loading=true]:pointer-events-none data-[loading=true]:opacity-80",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover",
        primary: "bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover",
        secondary: "bg-secondary text-foreground hover:bg-border",
        outline:
          "border border-border bg-card text-foreground shadow-xs hover:border-border-strong hover:bg-background-2",
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
        link: "rounded-sm text-brand-ink underline-offset-4 hover:underline",
        spark: "bg-primary text-primary-foreground shadow-spark hover:bg-primary-hover",
      },
      size: {
        sm: "h-8 px-3.5 text-xs",
        md: "h-10 px-[1.125rem] py-2",
        lg: "h-11 px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
)

export type ButtonVariantProps = VariantProps<typeof buttonVariants>
