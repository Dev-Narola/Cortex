/**
 * Card variants — the `cva` config for the Card surface.
 *
 * **F1 Part 3 (Task 21).** Extracted to its own file so the
 * design-system reviewer can scan every variant + state +
 * size in one place.
 *
 * **Variants.**
 *   - `default`  — surface with `bg-background` + subtle border
 *   - `elevated` — surface with `bg-card` + `shadow-md` + no border
 *   - `outline`  — surface with `bg-transparent` + `border-border`
 *   - `interactive` — like default, but adds `cursor-pointer`,
 *     `hover:border-ink-300`, and a `transition-colors`. Use
 *     for cards that navigate (e.g. dashboard tiles) or open
 *     a dialog (e.g. "Add a new API key").
 *   - `hoverable` — like default, but adds the hover border
 *     without the cursor. Use for cards that are clickable but
 *     visually look static.
 *
 * **Padding axis.** `none | sm | md | lg` — `none` is for cards
 * that own their internal layout (e.g. a table with its own
 * padding). Default `md`.
 *
 * **Radius axis.** `sm | md | lg | xl` — `xl` is the brand-default
 * dashboard tile; `sm` is for nested cards inside a larger one.
 *
 * **State.** `loading` dims the card and shows a Skeleton
 * shimmer (consumed by `<CardSkeleton>`); `selected` is for
 * selection-column tables; `disabled` is the rare "locked"
 * state for permission-gated surfaces.
 */

import { type VariantProps, cva } from "class-variance-authority"

export const cardVariants = cva(
  // No background in the base: each variant owns its surface so `glass`
  // is never overridden by bg-card.
  "rounded-xl border text-card-foreground transition-[transform,box-shadow,border-color,background-color] duration-base ease-out-quint",
  {
    variants: {
      variant: {
        default: "border-border bg-card shadow-xs",
        elevated: "border-border bg-card shadow-md",
        outline: "border-border bg-transparent",
        // Bento panels. Content cards stay opaque for readability; real
        // glass (the `glass` utility) is reserved for floating chrome:
        // top bar, popovers, dialogs, the composer.
        glass: "border-border bg-card shadow-xs",
        // Clickable cards only: small lift + stronger border on hover/focus.
        interactive:
          "cursor-pointer border-border bg-card shadow-xs hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md focus-within:border-brand-border active:translate-y-0",
        hoverable: "border-border bg-card shadow-xs hover:border-border-strong",
      },
      padding: {
        none: "",
        sm: "p-3",
        md: "p-5",
        lg: "p-6",
      },
      radius: {
        sm: "rounded-md",
        md: "rounded-lg",
        lg: "rounded-xl",
        xl: "rounded-2xl",
        "2xl": "rounded-3xl",
      },
      state: {
        default: "",
        loading: "pointer-events-none opacity-70",
        selected: "border-brand ring-1 ring-brand/30",
        disabled: "opacity-50 cursor-not-allowed",
      },
    },
    defaultVariants: {
      variant: "default",
      padding: "md",
      radius: "lg",
      state: "default",
    },
  },
)

export type CardVariantProps = VariantProps<typeof cardVariants>
