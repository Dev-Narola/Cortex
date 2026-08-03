# `@cortex/ui`

The Cortex design system. The single source of reusable UI
for every Cortex frontend app.

## Why this package exists

Without a shared UI package, every screen grows its own
button styling and the design language drifts within a sprint.
With it, every screen imports from one place and the design
language stays cohesive by default.

If a page needs a new visual pattern, **build it here first**,
then import it. Never duplicate UI in the app.

## Folder organisation

```
src/
├── components/
│   ├── buttons/        Button (+ buttonVariants)
│   ├── forms/          Input, Label, Select
│   ├── cards/          Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter
│   ├── dialogs/        Dialog, DialogTrigger, DialogContent, DialogTitle, …
│   ├── navigation/     Tabs, TabsList, TabsTrigger, TabsContent
│   ├── feedback/       Badge, Toast (+ toast, useToast, ToastProvider)
│   ├── tables/         (empty — F1 Part 2)
│   └── layout/         Separator
│
├── typography/         Heading, Text, Caption, Code, Link  (top-level by design)
├── icons/              Icon (lucide-react wrapper)
├── utils/              cn (clsx + tailwind-merge)
├── hooks/              (empty — F1 Part 2+)
└── styles/             tokens.css + globals.css (Tailwind v4 @theme)
```

Every category folder has an `index.ts` barrel. Components
themselves are **never imported directly** — the package
barrel (`packages/ui/src/index.ts`) is the single entry point.

## Naming conventions

| Type | Convention | Example |
|---|---|---|
| Component file | `PascalCase.tsx` | `Button.tsx`, `Card.tsx` |
| Component folder | lowercase, plural | `buttons/`, `cards/`, `forms/` |
| Variant config | `cva('...', { variants: { variant: {...} } })` + `xxxVariants` export | `buttonVariants` |
| Type for component props | `ComponentNameProps` | `ButtonProps`, `DialogProps` |
| Compound sub-parts | `Parent + SubPart` | `CardHeader`, `CardTitle`, `CardFooter` |
| Hook | `useThing` | `useToast` |
| Utility | `verbThing` | `cn`, `formatDate` |

Never use lowercase component filenames (`button.tsx` is
rejected at review). The linter catches the easy cases; review
catches the rest.

## Export conventions

Every component file follows the same export shape:

```ts
// MyThing.tsx
export interface MyThingProps extends HTMLAttributes<HTMLElement> { ... }
const MyThing = forwardRef<...>(...)
MyThing.displayName = "MyThing"
export { MyThing, myThingVariants }   // variants are exported for composition
```

Every category folder has an `index.ts` that re-exports
its components. The root `src/index.ts` re-exports every
category barrel.

**Consumers do `import { Button } from "@cortex/ui"`.** That
single import path is the contract — never reach into
`@cortex/ui/components/buttons/Button`.

## Variant conventions

Every interactive component has a `variant` + `size` (and where
relevant `tone`) shape declared via `class-variance-authority`:

```ts
const buttonVariants = cva("base classes…", {
  variants: {
    variant: { default: "...", destructive: "...", outline: "..." },
    size:    { default: "...", sm: "...", lg: "..." },
  },
  defaultVariants: { variant: "default", size: "default" },
})
```

**Never write `if (primary) { ... } if (danger) { ... }` inside
a component body.** Add a variant to the `cva` config instead.
The shape is discoverable in one place and the call site stays
declarative.

## Base props convention

Every component accepts the standard set of HTML props
appropriate for its element type, plus:

- `className` — appended via `cn()`, never replaces
- `ref` — always forwarded to the underlying element
- `disabled` — passed through (no `isDisabled`)
- `children` — typed explicitly on compound components

Avoid custom prop names that duplicate HTML attributes. If the
HTML attribute already exists, use it.

## Theme integration

Every component reads from the CSS variables defined in
`styles/tokens.css`. Never hard-code a colour:

| ❌ Never | ✅ Use |
|---|---|
| `text-white` | `text-foreground` (or `text-paper-50` on dark surfaces) |
| `bg-black` | `bg-background` |
| `bg-gray-900` | `bg-card` |
| `text-gray-500` | `text-muted-foreground` |
| `border-gray-200` | `border-border` |

The same component renders correctly on the marketing (light)
and authenticated app (dark) themes because the tokens flip
on the `<html class="dark">` selector. Never branch on theme
inside a component — that's a token's job.

## Accessibility expectations

- All interactive components are **keyboard navigable** (Tab,
  Enter, Space, arrow keys where appropriate).
- Focus is visible — every focusable element has a
  `focus-visible:ring-2 focus-visible:ring-ring` style.
- All form fields have a paired `<Label>`.
- Decorative icons get `aria-hidden="true"`; meaningful icons
  get `role="img" aria-label="..."` (the `<Icon>` component
  does this for you via the `label` prop).
- Components that build on Radix primitives inherit the Radix
  a11y contract: focus traps (Dialog), keyboard navigation
  (Tabs, Select), `aria-*` wiring for screen readers.

## Responsive expectations

- Layouts are mobile-first; the smallest breakpoint is the
  default, larger breakpoints add up.
- A `Card` is full-width on mobile, max-width on desktop.
- Dialogs become full-screen sheets on mobile.
- Tables get a horizontal scroll wrapper on small screens
  (F1 Part 2).

## Adding a new component

1. Pick the right category folder (`components/<category>/`).
   If it doesn't fit any existing category, add one.
2. Name the file `PascalCase.tsx` and follow the export shape
   in the **Export conventions** section.
3. Use `cva` for variants — no `if (variant === ...)` branches.
4. Add an `index.ts` barrel to the category folder if one
   doesn't exist.
5. Re-export from the root `src/index.ts`.
6. Add a Playwright test in `apps/web/e2e/` (F1 Part 2+).
7. Add a Storybook story if a story exists (F1 Part 2+).

## When NOT to add a component here

- **One-screen-only layout.** A bespoke `DashboardHero` lives in
  the screen's own folder, not here. The library ships atoms
  + small molecules, not pages.
- **Backend-driven data shape.** Don't build a `UserTable` that
  expects the `User` row shape — build a `DataTable<T>` that
  takes the data and lets the page pick the columns.
- **Stateful features.** Components in this package are
  presentational. The `useToast` hook is the only stateful
  exception, and it lives here because every screen needs it.

## Testing

- Unit tests live next to the package in F1 Part 2.
- Visual regression via Playwright `e2e/` snapshots in the
  consuming app.
- Every component gets a smoke test in F1 Part 2 (renders +
  no console errors + a11y audit via `@axe-core/playwright`).

## Versioning

The package follows the workspace's single-version policy
(via pnpm workspaces). Breaking a component is a breaking
change for every consuming app — that's the trade-off for a
shared design system. The change goes in a single commit and
ships through the normal release pipeline.
