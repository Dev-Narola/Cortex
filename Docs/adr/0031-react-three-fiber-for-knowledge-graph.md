# ADR-0031: `@react-three/fiber` + `@react-three/drei` for the Knowledge Graph Explorer

**Status:** Accepted (F6 — Knowledge Graph)
**Date:** 2026-08-19

## Context

F6 introduces a 3D knowledge-graph explorer
(`/app/graph`). The PRD calls for a screen that lets a
user search a real entity, see its connections highlight,
and click through to the source document. The interaction
model the UI spec commits to is **3D**: full-bleed canvas,
a floating search bar in the top-left, a node-detail
card on the right, and a Void-coloured scene where the
selected node + its active path read as the brightest
elements.

Three viable approaches were considered:

1. **Pure `three.js`** with a hand-rolled React renderer.
2. **A 2D fallback** (e.g. `react-flow` / `cytoscape`).
3. **`@react-three/fiber` (R3F) + `@react-three/drei`**.

## Decision

Use **`@react-three/fiber` (R3F) + `@react-three/drei`**
on top of `three.js` for the Knowledge Graph Explorer.

* The R3F `<Canvas>` is the single mount point for the
  scene (camera, lights, controls).
* `drei`'s `<OrbitControls>` provides orbit/zoom/pan
  with damping that respects `prefers-reduced-motion`.
* `drei`'s `<Html>` anchors DOM labels (node name, edge
  relation-type) in 3D space so the typography stays on
  the Tailwind token system (no canvas-rendered text).

The R3F dependency is **route-scoped**:

* The canvas is `next/dynamic(..., { ssr: false })` so
  the `three` + `drei` + `r3f` chunk only loads on
  `/app/graph`.
* Every other route (Dashboard / Documents / Chat /
  Settings / Agents) compiles without the graph bundle
  in its initial payload.

## Why this approach

* **React 19 + R3F 9 is the supported combo.** R3F 9
  is the first line that ships React 19 compatibility;
  older lines (`8.x`) break on `use()` + Suspense. We
  pin `@react-three/fiber@^9.7.0` and
  `@react-three/drei@^10.7.8` accordingly.
* **Renderer parity with the rest of the app.** The
  3D scene is a React tree, so the existing rules —
  React component boundaries, hook discipline, error
  boundaries, code-splitting via `next/dynamic` —
  all apply unchanged.
* **drei primitives cover the needs.** `<OrbitControls>`
  (camera), `<Html>` (labels), the material + light
  primitives cover the F6 visual spec without a hand-
  rolled GLSL detour.
* **Component-testable contract.** R3F can't render to
  happy-dom (no WebGL), but the contract — the colour
  mapping, the geometry helpers, the click handler —
  is testable in isolation through re-exported internals
  (`GraphNodeInternals`, `GraphEdgeInternals`).

## What was rejected

* **Pure `three.js`.** Loses the React-renderer
  boundary: the whole scene would have to be mounted
  imperatively and reconciled manually, breaking the
  "server-data → TanStack Query → adapter → R3F"
  pipeline the rest of the app uses.
* **A 2D library (`react-flow`, `cytoscape`, etc.).**
  The UI spec explicitly commits to a 3D canvas
  (full-bleed Void background, ember active-path
  nodes, spark-tinted active edges). A 2D fallback
  belongs to F9 (responsive / mobile), not F6.
* **Server-rendered 3D (`react-three-renderer`, etc.).**
  No need for server rendering of the 3D scene; the
  loading state is the R3F chunk, the empty state is
  the existing `EmptyState` card.

## Consequences

* **Bundle cost.** `three` + `r3f` + `drei` add
  ~600 KB gzipped to the graph route. The route-scope
  `next/dynamic` import keeps the cost off every other
  route. Lighthouse + bundle analysis is a F10+
  concern.
* **No SSR for the canvas.** The canvas is `ssr: false`
  in `next/dynamic`; the page's server entry renders a
  placeholder (the `loading.tsx` skeleton) until the
  chunk loads. This matches the rest of the app's
  client-only surfaces (the chat composer, the agent
  trace panel).
* **R3F 9's `<mesh>` doesn't accept `onKeyDown`**. The
  full keyboard-only audit on the 3D scene is deferred
  to F9 (the accessibility phase). Click-to-select is
  the only path today; the spec is explicit that the
  complete keyboard + reduced-motion audit belongs to
  F9, not F6.
* **WebGL failure is a recoverable error.** The route
  has an `error.tsx` boundary that renders a recovery
  card + Try again. The full 2D mobile fallback
  activates from inside this boundary — F9.

## Alternatives considered

* **Force-directed layout (e.g. `d3-force-3d`).** Not
  in F6 scope. The current layout is a deterministic
  radial spread (Mulberry32 PRNG seeded by sorted
  entity ids); force simulation is a F10+ item if
  the spec wants organic layout later.
* **Spark-tinted gradient on edges.** The active edge
  uses a single Ember-500 colour (the dominant Spark
  gradient stop) + boosted `emissiveIntensity`; a true
  gradient tube material is a F10+ item.
