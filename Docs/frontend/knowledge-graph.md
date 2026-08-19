# Knowledge Graph Explorer — F6 final notes

**Status:** F6 complete (Parts 1–4)
**Date:** 2026-08-19

The Knowledge Graph Explorer is a 3D screen at
`/app/graph` that lets a user search a real entity,
see its connections highlight, and click through to
the source document the entity was extracted from.

This document records the F6 architecture, the
verified backend contract, the F6 Part 4
performance budget, and the items deferred to F9 /
F10+.

## Architecture

```
           API (Cortex backend)
                   ↓
          TanStack Query (kgKeys.*)
                   ↓
       Adapter (adapters/kg-to-graph.ts)
                   ↓
          GraphData (rendering types)
                   ↓
              R3F Canvas
                   ↓
        GraphNode + GraphEdge components
                   ↓
              Three.js scene
```

* **API** — the backend mounts the KG router at
  `/api/v1/graph/...` (NOT `/kg/...` as the F0 spec
  originally assumed).
* **TanStack Query** — 5 hooks + a single
  `kgKeys` factory. Stale time 60s for entity /
  relations / neighbours / path, 30s for search.
  `gcTime` 5 minutes for search. 404/403 are not
  retried.
* **Adapter** — pure function. Translates the API's
  `KGEntity` / `KGRelationship` shapes into the
  rendering layer's `GraphNode` / `GraphEdge` shapes.
  Owns the layout (deterministic radial spread, seeded
  by sorted entity ids — same input = same output).
* **GraphData** — the rendering types. Backend ids
  (`canonical_id`, `source_chunk_id`) are preserved
  as `GraphNodeMetadata` so the detail panel + the
  source-doc clickthrough have them at click-time.
* **R3F Canvas** — single mount point. Owns the
  camera, lights, orbit controls, and the shared
  `BufferGeometry` for every sphere + cylinder in
  the scene. Code-split via `next/dynamic` so the
  three + drei + r3f chunk only loads on the graph
  route.
* **GraphNode + GraphEdge** — memoized
  (`React.memo` with a custom comparator that
  only re-renders on the props that actually
  matter). The shared geometry means a 1,000-node
  graph still allocates exactly one sphere
  geometry and one cylinder geometry.

## Backend endpoints used

All under `/api/v1/graph/`:

| Verb   | Path                                       | Hook                       | Notes |
| ------ | ------------------------------------------ | -------------------------- | ----- |
| `GET`  | `/entities/{id}`                           | `useKGEntity`              | Single-entity detail |
| `GET`  | `/entities/{id}/neighbors?direction=both`  | `useKGEntityNeighbors`     | Adjacent entity summaries |
| `GET`  | `/relationships?entity_id={id}`            | `useKGEntityRelations`     | All relations touching the entity |
| `GET`  | `/search?query={q}&type={t}&limit={n}`     | `useKGSearch`              | Returns both entities + relations |
| `GET`  | `/path?source={s}&target={t}&max_depth={d}`| `useKGPath`                | Shortest path between two entities (Part 3) |

The backend exposes `source_chunk_id` and
`canonical_id` on every entity + every
relationship (F6 Part 2 — additive change, no
breaking migrations). The frontend preserves both
through the adapter for the source-traceability
flow.

## Performance budget (F6 Part 4)

| Aspect                           | Target                                                  |
| -------------------------------- | ------------------------------------------------------- |
| Target device                    | Mid-range laptop (the roadmap's stated requirement)     |
| Browser                          | Chrome + Edge (the supported set)                      |
| Graph size (target)              | 250–500 nodes / 500–1,500 edges                         |
| Initial load                     | < 2s (after the R3F chunk has loaded)                   |
| Orbit / zoom / pan               | 60 FPS                                                 |
| Selection                        | < 100ms perceived                                      |
| Traversal update                 | < 200ms perceived                                      |
| Memory                           | No leak across navigation (TanStack cache + Zustand)    |

### How the budget is met

* **Shared geometry** — every node shares one
  `SphereGeometry`; every edge shares one
  `CylinderGeometry`. The canvas owns them
  via `useMemo`. At 1,000 nodes / 2,000 edges the
  allocation count is 2, not 3,000.
* **Reduced segment count** — 16×12 sphere
  segments (down from 32×32) and 8-segment
  cylinders. ~200 triangles per node, ~16 per
  edge.
* **`frameloop="demand"`** — R3F only renders
  when something changes (orbit input,
  active-path toggle, graph swap). No
  per-frame `useFrame` loop.
* **`React.memo` on every renderable
  component** with a custom comparator. An
  unrelated state change (e.g. the search
  bar's input) does not re-render the scene.
* **Stable prop identities** — the explorer's
  `onSelect` / `onEdgeSelect` are
  `useCallback`-d; the adapter's pure-function
  output keeps the same shape across renders
  (so the comparator's referential checks
  pass).
* **Frontend render cap** —
  `applyGraphLimits` truncates the graph at
  500 nodes / 1,500 edges. When the cap
  kicks in the explorer surfaces a
  "Showing the most relevant connections"
  notice (no silent performance failure).
* **No continuous animation** — the scene is
  static. The only motion is the user's orbit
  / zoom / pan and the active-path colour
  switch when the user picks a relation.

### Code-splitting verification

The production build's route manifest:

```
Route (app)                              Size     First Load JS
├ ○ /app/graph                           254 kB          552 kB
├ ○ /app/dashboard                       3.66 kB         286 kB
├ ○ /app/documents                       5.99 kB         312 kB
├ ○ /app/agents                          163 B           101 kB
├ ○ /app/conversations                   163 B           101 kB
├ ○ /app/settings                        623 B           274 kB
├ ƒ /chat/[conversationId]               1.47 kB         316 kB
```

The 254 KB graph bundle only loads on
`/app/graph`. Every other route compiles
without `three`, `drei`, or `@react-three/fiber`
in its initial payload (the 101 KB shared is the
app shell + auth + TanStack Query).

## Visual specification (per the UI spec)

* **Background:** Void `#0B0D12` (full-bleed).
* **Node states (4):**
  * `default` — Volt-500 (`#84cc16`)
  * `selected` — Volt-300 (`#bef264`) + scale 0.45
  * `active-path` — Ember-500 (`#f97316`) + scale 0.42
  * `dimmed` — Volt-900 (`#365314`) at 35% opacity
* **Edge states (2):**
  * `default` — Slate-600 (`#475569`) at 60% opacity
  * `active` — Ember-500 at 95% opacity (Spark-tinted)
* **Layout:** Search bar top-left, node-detail
  card top-right, canvas fills the rest.

## States (verified)

| State                       | Where it shows                                    |
| --------------------------- | ------------------------------------------------- |
| Initial loading             | `loading.tsx` skeleton (pulsing Volt ring)        |
| Entity loading              | Floating "Loading entity…" toast                  |
| Relation loading            | "Loading…" indicator in the detail card          |
| Traversal loading           | (Path arrives with the entity response)           |
| Empty graph (no search)     | "Search for an entity to begin" empty card        |
| Empty graph (no results)    | "No matching entity found" (in the search list)   |
| No relations on entity      | "No connected relationships found" in the card   |
| Large graph (truncated)     | "Showing the most relevant connections" notice    |
| WebGL failure               | `error.tsx` boundary with "Try again"            |
| Session expiry              | api-client silent refresh → /login on failure     |
| Source unavailable          | Detail card shows chunk id, no "View source" CTA |

## Engineering rules followed

* **No direct `fetch()` in components.** Every
  request goes through `services/graph/kg.ts`
  → `useKG*` hook → `GraphExplorer`.
* **TanStack Query owns server state.** No
  second cache, no Zustand mirror.
* **No production mock data.** `DEMO_GRAPH` is
  exported for tests + Storybook; the production
  route derives its data from the API. (Task 32
  of the F6 spec.)
* **Tenant context is not manually overridden.**
  The api-client injects the JWT; the backend
  enforces tenant scope at the SQL level.
* **Existing document UI is reused.** The
  source-document clickthrough delegates to
  `documentSelectionStore.openDetail(id)` — the
  same store F4's chat citation panel uses.
  No second document viewer.
* **ADR exists for the 3D dependency.** See
  `Docs/adr/0031-react-three-fiber-for-knowledge-graph.md`.

## Test coverage

* 632/632 frontend unit tests pass.
* 887/887 backend tests pass (no F6 backend
  changes since Part 2).
* New F6 Part 4 tests:
  * `graph-performance.test.ts` — 17 tests
    (adapter determinism, cap behaviour, layout
    bound, half-edge rejection).
  * `graph-regression.test.ts` — 7 tests
    (active-path state machine, source-doc
    clickthrough independence).
  * `graph-source-trace.test.ts` — 10 tests
    (provenance preservation, drawer delegation,
    cross-entity no-leak).
* Existing graph tests still pass (no
  regressions in the 39 tests from Parts 1–3).

## Known limitations (deferred to later phases)

Per the Frontend Roadmap, the following are
**explicitly out of F6 scope** and live in F9 / F10+:

| Item                                          | Phase    | Notes |
| --------------------------------------------- | -------- | ----- |
| 2D mobile fallback (when WebGL is unavailable) | F9       | `error.tsx` boundary is the F6 seam |
| Full keyboard-only audit on the 3D scene      | F9       | R3F `<mesh>` doesn't accept `onKeyDown` natively |
| Reduced-motion audit (complete)               | F9       | F6 respects `prefers-reduced-motion` for OrbitControls damping; the full audit is F9 |
| Force-directed layout                          | F10+     | Current layout is a deterministic radial spread (Mulberry32 PRNG seeded by sorted entity ids) |
| Spark gradient on active edges                 | F10+     | Current active edge uses Ember-500 + boosted `emissiveIntensity`; a true gradient tube is a future item |
| Cross-screen accessibility pass               | F9       | F6 screens are accessible per their own contracts; the cross-screen audit is F9 |
| Bundle-size / Lighthouse hardening             | F10+     | The graph route is 254 KB today; Lighthouse + perf budget on CI is F10+ |
| Visual regression                              | F10+     | Chromatic / Percy is F10+ |

## Final acceptance scenario

> **Search for a real entity → see its connections
> highlight → click through to the source
> document it was extracted from → perform the
> whole interaction at an acceptable frame rate
> on ordinary hardware.**

This is the F6 Definition of Done. The acceptance
flow:

1. `POST /auth/login` → JWT
2. Navigate to `/app/graph`
3. Type a real entity name in the search bar
4. Click the result → entity + relations + neighbours
   load via TanStack Query
5. `toGraph` adapter builds the rendering graph
6. The R3F canvas renders the root + its
   neighbours in the Volt-500 default state
7. Click a node → `GraphNodeDetail` opens with
   the entity's metadata + the relations list
8. Click a relation → `activePath` state sets →
   the active edge renders Ember-tinted, the
   endpoints render Ember-coloured
9. Click "View source" → the existing F3
   document detail drawer opens with the source
   document

The whole flow runs inside the F6 Part 4
performance budget on a mid-range laptop.
