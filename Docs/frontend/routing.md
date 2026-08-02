# Routing

V9 Frontend — companion to `apps/web/app/`.

The web app uses Next.js 15's App Router with **route groups**
(bracketed directories that don't appear in the URL) to
separate concerns without affecting the URL structure.

## Route groups

| Group | URL prefix | Auth | Render mode | Notes |
| --- | --- | --- | --- | --- |
| `(marketing)` | `/`, `/pricing`, `/docs` | Public | Statically generated | SEO-driven, ISR every 5 min |
| `(auth)` | `/login`, `/register`, `/accept-invite/[token]` | Redirect if signed in | Static | Centered single-column |
| `(app)` | `/app/*` | Redirect to `/login` if no token | Client-rendered | Sidebar + topbar shell |

The middleware (`apps/web/middleware.ts`) enforces auth at the
edge before any page bytes ship. A 401 in the access token
falls back to the refresh-token cookie — the page renders and
the in-page store silently refreshes.

## Layouts

| File | Wraps |
| --- | --- |
| `app/layout.tsx` | The whole app — fonts, `<html>`, providers |
| `app/(marketing)/layout.tsx` | Marketing nav + footer (TODO) |
| `app/(auth)/layout.tsx` | Centered card shell |
| `app/(app)/layout.tsx` | Sidebar + topbar + content area |

## Route handlers

The `app/api/` directory is reserved for the rare Next.js
route handler that must run on the edge (e.g. a service-token
callback). The V9 web app is a **consumer** of the backend API
(`/api/v1/*`), not a provider.

## Error handling

| File | Trigger | Behaviour |
| --- | --- | --- |
| `app/error.tsx` | Unhandled error in a route segment | Renders the global error card with a `Try again` button |
| `app/not-found.tsx` | 404 | Renders the not-found card |
| `app/(app)/app/error.tsx` (TODO) | App-shell error | Renders the in-app error card |

## Adding a new route

1. Pick the right route group.
2. Create the file under the matching `app/(group)/...`
   directory.
3. If the page needs server data, add a server component that
   fetches via `getServerEnv()` + the API client.
4. If the page needs interactivity, mark it `"use client"` and
   use TanStack Query for the data fetching.
5. Run `pnpm typecheck` — the typed-routes plugin will surface
   any broken `<Link href=...>` at build time.
