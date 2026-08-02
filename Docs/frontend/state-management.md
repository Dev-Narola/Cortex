# State Management

V9 Frontend — companion to `apps/web/lib/`.

The web app uses three layers of state, picked by concern:

| Layer | Library | Used for |
| --- | --- | --- |
| Server cache | TanStack Query | REST reads + mutations, background revalidation, optimistic updates |
| GraphQL cache | urql + `@urql/exchange-graphcache` | The `/graphql` knowledge-graph endpoint only — normalized cache, partial updates |
| Global UI | Zustand | Active conversation id, sidebar collapse, theme-transition flag, streaming buffer |
| Form state | React Hook Form + Zod | Every form (login, register, upload, settings) |
| Theme | next-themes | `class`-based dark/light toggle |

## Why not Redux / Recoil / MobX?

Zustand gives us:
* No provider wrapping (one global store, import anywhere).
* Selectors with shallow equality so re-renders are surgical.
* Persist middleware for the auth state (sessionStorage only).

A single store is enough. The pattern scales by **splitting
the store per concern** (auth, UI, streaming), not by adding
a reducer.

## Server state

* TanStack Query is configured in `components/providers.tsx`
  with `staleTime: 30s` and `refetchOnWindowFocus: false`.
* Queries are keyed by URL + params (`['documents', { tenantId, page }]`).
* Mutations invalidate the relevant query keys on success.
* Optimistic updates are used for the document upload (per the
  React 19 `useOptimistic` hook) and the conversation rename.

## GraphQL state

* `urql` is wired with a normalized cache
  (`graphcacheExchange`) so clicking node A → node B → back to A
  doesn't re-fetch.
* The cache key is `(type, id)` by default; custom resolvers
  are registered in `components/providers.tsx`.

## Streaming state

The chat streaming is **not** a Zustand store. The hook
`useRafStream` lives in `lib/streaming/` and owns a buffer +
state synchronised via `requestAnimationFrame`. This is the
right place for it because:
* The buffer is local to one component instance.
* The re-render rate must be capped (one per frame).
* Putting it in Zustand would force a global re-render for
  every token, which is what we explicitly avoid.

## Theme state

`next-themes` writes the class on `<html>` directly. The
`ViewTransitions` provider wraps the theme setter so the
morph is native + GPU-accelerated.
