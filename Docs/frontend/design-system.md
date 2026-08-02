# Design System

V9 Frontend — companion to `frontend/packages/ui/`.

The design system is split into three layers:

1. **Tokens** (`packages/ui/src/styles/tokens.css`) — OKLCH
   color tables, type scale, easings, motion durations. The
   single source of truth.
2. **Primitives** (`packages/ui/src/primitives/`) — Radix-wrapped
   shadcn-style components: button, input, dialog, card, label,
   select, tabs, separator, badge, toast.
3. **Theme** (`apps/web/lib/theme/`) — the `next-themes` provider,
   the `ViewTransitions` wrapper for the light↔dark morph, and
   the `ThemeToggle` component.

## Color philosophy

The brand gradient is called **Spark** — `ember-500 → ember-300 → volt-500`
on a 135° line. It is the only place in the system that should
use the gradient directly. The rest of the UI uses the flat
OKLCH palette.

The light theme is the **Cloud / Ink / Ember / Volt** family;
the dark theme is the **Void / Slate / Paper** family. The
mapping is mechanical — the light/dark mode is a class toggle,
not a hand-rolled override.

## Type scale

Display: **Bricolage Grotesque** (loaded via `next/font/google`).
Body: **Inter** (variable, self-hosted).
Mono: **JetBrains Mono**.

`General Sans` is the marketing-only display variant, loaded
from Fontshare via `next/font/local` and reserved for the hero
in the (marketing) route group.

## Motion

* Easings: `--ease-out-quint` (entrances), `--ease-in-out-quart`
  (state changes).
* Durations: `--duration-fast` (150ms), `--duration-base`
  (250ms), `--duration-slow` (400ms), `--duration-stage`
  (1.4s — the hero sequence).
* The theme switch uses the View Transitions API
  (`document.startViewTransition`).
* The knowledge graph honours `prefers-reduced-motion` by
  pausing the simulation after a single stabilisation pass.
* GSAP is loaded **only** in the (marketing) route group;
  Framer Motion is the in-app default.

## Tailwind v4

Tokens are wired into Tailwind via the `@theme` block in
`packages/ui/src/styles/globals.css`. The OKLCH color tables
become Tailwind utilities automatically — `bg-ember-500`,
`text-void-500`, `border-cloud-200` are all valid. Components
never reference raw hex values.

## Adding a primitive

1. Drop a new file in `packages/ui/src/primitives/`.
2. Wrap a Radix primitive (or write a new headless component).
3. Use only the OKLCH tokens via Tailwind utilities.
4. Export it from `packages/ui/src/primitives/index.ts`.
5. Add a test under `apps/web/tests/components/`.

The CI gate will fail the build if a new component imports a
raw color value (`#fff`, `rgb(...)`, `hsl(...)`).
