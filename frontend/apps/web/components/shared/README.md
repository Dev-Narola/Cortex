# `components/shared/`

**F0 scope.** Truly cross-cutting, theme-agnostic building blocks that
every screen might use but don't belong in `packages/ui`:

- `Logo` (the brand mark — used in marketing + app shell)
- `Brand` (logo + name lockup)
- `LoadingScreen` (full-page skeleton for initial auth hydration)
- `ErrorBoundary` (re-usable client-side boundary, mirrors `error.tsx`)
- `CopyButton` (one-click clipboard for tokens / IDs)

If a component is only used in one place, it stays inside the folder
that uses it. This folder is the smallest of the three — most
"shared" things are primitives in `packages/ui` first.
