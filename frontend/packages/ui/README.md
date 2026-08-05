# `@cortex/ui`

The Cortex design system. Every reusable primitive the apps compose from.

> **Read first.** [Docs/UI-UX.md](../../../Docs/UI-UX.md) is the full visual / behavioural identity. This README is the developer entry point.

## What ships here

- **Primitive components** (Parts 1–2) — Button, Input, Textarea, Label, Checkbox, RadioGroup, Switch, Select, Toast, Spinner, Skeleton, Tooltip, Avatar, Badge, Heading, Text, Caption, Code, Link, Icon, Separator, `cn`.
- **Complex components** (Part 3) — Card + compound parts, Dialog + compound parts (sm/md/lg/xl/fullscreen), Drawer (left/right/top/bottom), DropdownMenu, Table + compound parts, Sidebar, Topbar, UserMenu, Logo, Tabs, Breadcrumb, Pagination, EmptyState, ErrorState, LoadingState.
- **Form composition** (Part 4) — `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`.
- **Layout primitives** (Part 4) — `Page`, `PageHeader`, `PageContent`, `Section`, `Container`, `Grid`.
- **Motion** (Part 4) — `fade`, `slide`, `scale`, `stagger`, `page` presets in `motion/`. CSS keyframes in `styles/motion.css`.
- **Icons** (Part 4) — `Icon` (single entry point, lucide-react backed) + curated category lists (`actions/`, `navigation/`, `status/`, `documents/`, `agents/`, `settings/`).
- **Styles** — `globals.css` (Tailwind v4 `@theme` + base reset) + `tokens.css` (OKLCH colour table for light + dark).

## Importing

```ts
// Single barrel — never reach into components/... directly.
import { Button, Card, Dialog, Icon } from "@cortex/ui"

// Side-effect styles — import once at the root layout.
import "@cortex/ui/globals.css"
```

## Scripts

```bash
pnpm --filter @cortex/ui typecheck    # tsc --noEmit
pnpm --filter @cortex/ui lint        # biome check src/
pnpm --filter @cortex/ui format      # biome format --write src/
pnpm --filter @cortex/ui test:unit   # vitest run
```

## Composition rules (don't break these)

- **No feature-specific UI.** Specialised surfaces extend a `Card` / `Dialog` / `Drawer` variant; they do not live in a feature folder.
- **No hard-coded colours.** Every colour is a CSS variable token (`bg-card`, `text-muted-foreground`, `border-border`, …).
- **Every visual axis is a `cva` config.** Never branch on `variant === "..."` at the call site.
- **`asChild` for routing.** Interactive primitives that need to wrap a `next/link` (`Button`, `SidebarItem`) accept `asChild` and use Radix `Slot`.
- **a11y by default.** Radix primitives are used for every interactive component — keyboard nav, focus trap, ARIA wiring are inherited.

## Folder map

```
src/
├── components/
│   ├── buttons/         Button + variants
│   ├── cards/           Card + compound parts
│   ├── dialogs/         Dialog + compound parts + size axis
│   ├── feedback/        Toast, Spinner, Skeleton, Tooltip, EmptyState, ErrorState, LoadingState
│   ├── forms/           Input, Textarea, Label, Checkbox, RadioGroup, Switch, Select, FormField family
│   ├── data-display/    Avatar, Badge
│   ├── layout/          Page, PageHeader, PageContent, Section, Container, Grid, Separator
│   ├── navigation/      Sidebar, Topbar, UserMenu, Logo, Tabs, Breadcrumb, Pagination
│   ├── overlays/        Drawer, DropdownMenu
│   └── tables/          Table, TableHeader, TableBody, TableRow, TableCell, TableHead, TableToolbar
├── icons/               Icon + categories + subfolders (actions/ navigation/ status/ documents/ agents/ settings/)
├── motion/              fade, slide, scale, stagger, page
├── styles/              globals.css, tokens.css, motion.css
├── hooks/               (empty placeholder)
├── utils/               cn
└── index.ts             single barrel
```

## Adding a new component

1. Pick the right folder (or create a new one if the category doesn't exist).
2. Split the component + variants into per-file: `<Name>.tsx` + `<name>.variants.ts` when there's a non-trivial variant space.
3. Add a `*.test.tsx` next to it covering rendering + props + variants + a11y.
4. Re-export from the category's `index.ts` AND from the root `index.ts`.
5. Update [Docs/UI-UX.md §9 Component Library](../../../Docs/UI-UX.md) with the new export.
