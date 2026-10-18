# Cortex design system

Single source: `packages/ui/src/styles/tokens.css` (values) → `globals.css` (Tailwind `@theme` mapping +
utilities) → `@cortex/ui` components. Components use semantic tokens, never raw palette values, so dark and
light both work. `tests/final-qa.test.tsx` pins the identity values below.

## Color

Dark is the primary theme (`next-themes`, `.dark` on `<html>`, default `dark`, user-switchable from the
topbar; the choice persists everywhere, marketing included).

| Token (class) | Dark | Light | Use |
|---|---|---|---|
| `background` | `#080B12` | `#F7F9FC` | Page |
| `background-2` | `#0D1220` | `#EEF2F8` | Sidebar, drawers, code blocks |
| `card` | `#111827` | `#FFFFFF` | Opaque surfaces (tables, dense text) |
| `glass` / `glass-strong` | white 5.5% / 8.5% | white 72% / 88% | Bento cards, nav, overlays |
| `border` / `divider` / `glass-border` | white 11% / 8% / 11% | `#101828` 10% / 7% / 8% | Edges |
| `foreground` / `muted-foreground` / `faint` | `#F3F6FC` / `#A1AEC3` / `#738198` | `#101828` / `#475467` / `#667085` | Text levels |
| `brand` (= `primary`, `ring`, `success`) | emerald `#34D399` | `#047857` | Actions, active nav, focus |
| `brand-2` | teal `#2DD4BF` | `#0F766E` | Secondary accent |
| `info` | `#60A5FA` | `#2563EB` | Informational |
| `ai` | violet `#A78BFA` (highlight `#C4B5FD` = `violet-300`) | `#7C3AED` | AI emphasis, sparingly |
| `warning` / `error` (= `destructive`) | `#FBBF24` / `#FB7185` | `#B45309` / `#E11D48` | States |

Scales: `emerald-*`, `teal-*`, `gray-0…950`, `signal-400/600`, `violet-300/400`. Legacy names (`ember`,
`volt`, `ink`, `cloud`, `mist`) are aliases onto these so older classes render in the new identity; the old
`void` / `slate` / `paper` scales were removed (a codemod moved their uses to semantic tokens).
`bg-spark` / `text-spark`: emerald → teal → blue gradient, for one hero element per screen at most.

## Type

`next/font` (self-hosted): Inter for UI (`font-sans`, default), Space Grotesk for headings and metrics
(`font-display`), JetBrains Mono for ids, keys, code (`font-mono`). Use `tabular` on numbers that update.
Page title: `font-display text-3xl font-semibold tracking-tight`. Section title: `font-display text-base
font-semibold`.

## Shape and space

Radii: `rounded-md` 8px (controls), `rounded-xl` 16px (cards), `rounded-2xl` 20px (bento panels),
`rounded-3xl` 24px (hero panels), `rounded-full` (pills, search). Spacing on the 4/8 grid (Tailwind
defaults). Page gutter `px-4 sm:px-6 lg:px-8`; content `max-w-7xl` (dashboards) or `max-w-4xl` (reading).

## Surfaces

- `Card variant="glass"`: bento cards and panels. `variant="interactive"`: clickable cards (hover lift +
  brand border). `variant="default"`: opaque, for tables and long text, which glass would hurt.
- `glass` / `glass-strong` utilities for one-off surfaces (search bar, workspace chip).
- `bg-ambient`: app and marketing background, two static low-alpha brand glows (no animation).
- Shadows `shadow-xs…xl` switch with the theme; `shadow-spark` is a brand glow.

## Components added or changed

- `MetricCard` (`apps/web/components/dashboard`): one backend number, skeleton while loading, explicit
  "Unavailable" on error (never a silent zero).
- `MarkdownMessage` (`components/chat`): GFM via `react-markdown` (no raw HTML), citation markers → chips
  only when the citation exists.
- `SidebarNav`: grouped Workspace / Management / System; owner/admin-only items hidden for other roles;
  `navItemFor(path)` also drives breadcrumbs and the page-transition key.
- `SidebarItem` active state: brand tint + 2px accent bar. `Button` default = brand fill.

## Motion

CSS only (no animation library). `animate-rise-in` (6px rise, 240ms) on route-section change;
`stagger-rise` on bento grids (45ms steps, capped); hover lift on interactive cards; skeleton pulse for
loading. `prefers-reduced-motion` zeroes durations globally (tokens + a blanket rule in `motion.css`).

## Accessibility rules

Focus rings on every interactive element (`focus-visible:ring-2 ring-ring`); live regions use `<output>`;
dialogs and the mobile nav are Radix (focus trap, Esc, focus return); skip link → `#main`; icon-only
buttons have `aria-label`; decorative SVG is `aria-hidden`. Biome suppressions are allowed only with a
reason on the same line (see `role="search"`, clickable audit rows, positional skeleton keys).
