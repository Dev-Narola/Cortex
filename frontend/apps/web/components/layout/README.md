# `components/layout/`

**F0 scope.** App-shell chrome used by every route group:

- `Sidebar` (left rail in `(app)`)
- `TopBar` (header in `(app)`)
- `PageHeader` (page-title + breadcrumb + actions row)
- `EmptyState` (zero-data placeholder)

These are imported by `app/(app)/layout.tsx`. The marketing layout
(`app/(marketing)/layout.tsx`) uses none of them.

Feature-local layout (a `ChatMessageList`, a `GraphInspector` rail)
lives inside its own feature folder under `components/`.
