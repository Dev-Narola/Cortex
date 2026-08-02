# `components/providers/`

**F0 scope.** Cross-cutting React context providers that wrap the entire
app or a route group:

- `ThemeProvider` (next-themes)
- `QueryClientProvider` (TanStack Query)
- `UrqlProvider` (GraphQL client — wired in F6)
- `ToastProvider` (shadcn/ui toast)
- `ViewTransitionProvider` (theme switch)

Concrete provider composition lives in `components/providers.tsx` at
this layer's root and is re-exported from this folder's `index.ts` so
the import path is stable as providers are split into individual files.

Feature-specific providers (e.g. a `<GraphWorkspaceProvider>`) belong
in their own feature folder, not here.
