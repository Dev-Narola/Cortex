# `@cortex/ui`

Reusable React primitives shared across every Cortex frontend app.
Built on top of [shadcn/ui](https://ui.shadcn.com/) + [Radix UI](https://www.radix-ui.com/).

## What lives here

- `src/primitives/` — unstyled, accessible primitives (Button, Input,
  Card, Dialog, Tabs, Toast, …). All themable via CSS variables.
- `src/styles/tokens.css` — OKLCH light + dark palettes. **The single
  source of truth for color, spacing, and motion tokens.**
- `src/styles/globals.css` — Tailwind v4 base + token imports.
- `src/utils/cn.ts` — the `cn()` class-name helper (clsx + tailwind-merge).

## What does NOT live here

- App-specific layouts (Sidebar, TopBar) → `apps/web/components/layout/`
- Feature components (DocumentRow, GraphCanvas) → `apps/web/components/<feature>/`
- Business logic, hooks, or stores → `apps/web/lib/`
- React-free utilities → `@cortex/config` or `@cortex/api-client`

## Consumption

```tsx
import { Button, Card, CardContent } from "@cortex/ui";
```

The package is wired into the workspace as `workspace:*` in
`apps/web/package.json`; pnpm symlinks it on install.
