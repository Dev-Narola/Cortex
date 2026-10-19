# Cortex design system (orange-first, 2026-10-19)

Single source: `packages/ui/src/styles/tokens.css` (values) → `globals.css` (Tailwind `@theme` mapping +
utilities) → `@cortex/ui` components. Components use semantic tokens, never raw palette values, so light and
dark both work. `apps/web/tests/final-qa.test.tsx` pins the identity values below.

## Direction

Warm, editorial, restrained. Warm-paper light theme with white panels; warm-charcoal dark theme (never pure
black). Orange marks primary actions, the current place, selection and AI activity; everything else is
neutral. Bento grids for overviews, opaque cards for content, glass only on floating chrome.

## Color

Theme: `next-themes`, `.dark` on `<html>`, default **system**, switchable (Light / Dark / System) from the
top bar; stored in `localStorage("theme")` and applied by a pre-paint script (no flash).

| Token (class) | Light | Dark | Use |
|---|---|---|---|
| `background` | `#F3F3F0` | `#171715` | Page |
| `background-2` | `#F8F7F4` | `#1D1D1A` | Sidebar, history pane, table headers, assistant bubbles |
| `card` | `#FFFFFF` | `#242421` | Panels and bento cards |
| `popover` | `#FFFFFF` | `#2B2A26` | Menus, dialogs, drawers, toasts (elevated) |
| `surface-tint` | `#F5EDE5` | `#2A241E` | Warm emphasis (avatars, file tiles) |
| `border` / `border-strong` / `divider` | `#E7E4DE` / `#D8D3CB` / `#EEEBE6` | `#393832` / `#4A473F` / `#2F2E29` | Edges |
| `foreground` / `muted-foreground` / `faint` | `#202020` / `#65635F` / `#706E68`* | `#F4F0E9` / `#C0BBB2` / `#918B82` | Text levels |
| `primary` (`primary-hover`) | `#FF914D` (`#F47732`), charcoal text | `#FF9B5E` (`#FFAD78`), dark text | Primary buttons |
| `brand` | `#F47732` | `#FF9B5E` | Icons, indicators, bars, selection |
| `brand-ink` | `#B04A12` | `#FFC19D` | Orange **text** (links, labels) |
| `brand-soft` / `brand-border` | `#FFF3EA` / `#F5C5A7` | orange 12% / 28% | Pale emphasis surfaces |
| `ring` | `#CC5A1E` | `#FF9B5E` | Focus |
| `success` / `warning` / `error` / `info` | `#1C7550`* / `#8F5E10`* / `#B83C3C`* / `#3466AA` | `#5BBF8E` / `#E0A84A` / `#EB7D7D` / `#82AAEA` | States (never orange alone) |
| `chart-1…5` | orange, teal, blue, violet, lime | lighter variants | Data series, entity types |

\* Contrast-adjusted: the brief's `#8A8882` muted text (3.2:1), `#21865B` success, `#B7791F` warning and
`#C84646` error fall below 4.5:1 for small text on `#F3F3F0`, so light mode uses the slightly deeper values
shown. The brief's values remain in the scales (`gray-500`, etc.) for fills and icons.

Scales: `orange-50…900`, `gray-0…950` (warm), accents `lime-400/600`, `teal-400/700`, `blue-400/700`,
`violet-400/700`. Legacy names (`ember`, `volt`, `ink`, `cloud`, `mist`) alias onto these. `bg-spark` is an
orange-only gradient for the logo tile and marketing accents; text on it is always charcoal.

## Type

`next/font` (self-hosted): Inter for UI (`font-sans`), **Manrope** for headings and figures
(`font-display`), JetBrains Mono for ids, keys, code (`font-mono`). `tabular` on numbers.
Page title: `PageHeader` (`font-display`, 28→34px, medium weight, -0.02em). Section title (settings):
`SectionHeader` (`font-display text-lg font-semibold`). Card title: `font-display 15px semibold`.

## Shape and space

Radii: `rounded-md` 8px (small controls), `rounded-lg` 10px (inputs), `rounded-xl` 14px (standard panels),
`rounded-2xl` 20px (bento cards, chat/graph workspaces), `rounded-3xl` 24px (hero panels), `rounded-full`
(buttons, pills, tags, search). 4/8px spacing. Page gutter `px-4 sm:px-6 lg:px-10`; content `max-w-7xl`
(overviews) or `max-w-5xl` (settings) / `max-w-4xl` (search).

## Surfaces

- `Card` (any variant) is an opaque panel with a hairline border and `shadow-xs`; `variant="interactive"`
  adds a 2px hover lift. `variant="glass"` is kept for API compatibility and renders as a panel.
- `glass` / `glass-strong` utilities (white 78% / charcoal 82%, 16px blur): top bar, graph overlays,
  floating status pills. Not for tables, chat answers or forms.
- Hero emphasis: `bg-brand-soft border-brand-border` (dashboard Ask panel, auth brand panel, usage cost).
- Shadows are soft and warm (`shadow-xs…xl`); `shadow-spark` is a faint orange glow, marketing only.

## Signature components

- Brand mark: charcoal lightning bolt on an orange tile (`Logo`, `public/favicon.svg`); `BoltMark` is the
  small version used as Cortex's voice in chat and on the Ask bar.
- `AskBar` (dashboard): floating pill composer; submitting creates a real conversation
  (`useStartConversation`, shared with `/chat`).
- `PageHeader`, `SectionHeader`: the only page / settings header patterns.
- Sidebar active item: raised white pill + orange icon. Settings tabs: segmented pill bar.
- Chat: user bubble pale orange, assistant bubble neutral with the bolt label, "Sources" row of titled
  citation pills under each answer (inline `[n]` markers stay superscript chips).
- Documents toolbar: search, status pills with counts, sort menu; stage progress bar only while in flight.
- Knowledge graph: Vogel-disc layout facing the camera, nodes coloured by entity type, orange for the
  selection and traced path, names on hover/selection for graphs over 24 nodes.

## Motion

CSS only. `animate-rise-in` (6px, 240ms) on section change; `stagger-rise` on bento grids; 2px hover lift
on interactive cards; button press `scale(0.98)`; composer focus halo (4px brand-soft ring); live
"Generating" dot while streaming. `prefers-reduced-motion` zeroes durations globally.

## Accessibility rules

Focus rings on every interactive element (`focus-visible:ring-2 ring-ring`); live regions use `<output>`;
dialogs, drawers and menus are Radix (focus trap, Esc, focus return); skip link → `#main`; icon-only
buttons have `aria-label`; decorative SVG is `aria-hidden`; status is never conveyed by orange alone
(badges carry text). Biome suppressions only with a reason on the same line.
