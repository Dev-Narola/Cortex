# Cortex Frontend — F10 Performance

**Status:** F10-Part 2 (Bundle Optimization & 3D Route Isolation) — complete.
F10-Part 1 audit + F10-Part 2 wins both shipped. The runtime Lighthouse
runs are still pending a local Chrome environment; the bundle budget
established in F10-Part 2 is the more useful regression detector for
the changes made here.

## Purpose

F10 is the post-F9 hardening phase. F10-Part 1 establishes a reliable
performance baseline for the completed F0–F9 frontend. The
**explicit rule of this part is "measure, do not optimize"** — any
code change belongs in F10-Part 2 onwards.

## Baseline Environment

To be filled in by the runtime Lighthouse run.

```text
Browser:           Chromium (Lighthouse default)
Browser version:   TBD
OS:                TBD
Viewport:          Mobile 412x823 / Desktop 1350x940 (Lighthouse defaults)
Network:           Simulated 4G (Lighthouse mobile default)
CPU throttling:    4x slowdown (Lighthouse mobile default)
Frontend commit:   F9-P5 → main (eb48986) + F10-P1 → main (this part)
Build:             pnpm --filter @cortex/web build (Next.js 15.0.3)
Date:              TBD
```

## Production Build (Task 1)

The `pnpm --filter @cortex/web build` step passes with 0 errors
(verified at the start of F10-P1). Route manifest from
`next build`:

```text
Route (app)                              Size     First Load JS
┌ ƒ /                                    11.3 kB         294 kB
├ ○ /_not-found                          163 B           101 kB
├ ○ /app                                 163 B           101 kB
├ ○ /app/agents                          163 B           101 kB
├ ƒ /app/agents/[agentId]/runs/[runId]   805 B           311 kB
├ ○ /app/conversations                   163 B           101 kB
├ ○ /app/dashboard                       3.66 kB         286 kB
├ ○ /app/documents                       5.99 kB         312 kB
├ ○ /app/graph                           255 kB          554 kB
├ ○ /app/mcp                             163 B           101 kB
├ ○ /app/settings/api-keys               205 B           315 kB
├ ○ /app/settings/audit-log              5.67 kB         304 kB
├ ○ /app/settings/mcp                    2.6 kB           318 kB
├ ○ /app/settings/team                   5.27 kB         313 kB
├ ○ /app/settings/usage                  3.46 kB         302 kB
├ ○ /chat                                990 B           316 kB
├ ƒ /chat/[conversationId]               1.47 kB         316 kB
├ ○ /component-showcase                  3.99 kB         277 kB
├ ƒ /forgot-password                     161 B           315 kB
├ ƒ /login                               161 B           315 kB
├ ○ /pricing                             163 B           101 kB
├ ƒ /register                            160 B           315 kB
├ ƒ /reset-password                     160 B           315 kB
└ ○ /workspace-setup                     703 B           318 kB
+ First Load JS shared by all            100 kB
  ├ chunks/5499ed8e-6dbf3e195d033e2e.js  52.5 kB
  ├ chunks/693-bcb6f0566dda0987.js       45.9 kB
  └ other shared chunks (total)          2.07 kB
ƒ Middleware                             32.2 kB
```

**Reading the manifest**

- **First Load JS shared (100 kB):** Next.js framework + react + a
  tiny pre-app shell. Every route pays this.
- **`/app/graph` (255 kB route, 554 kB First Load JS):** the 3D
  graph. The 255 kB delta is the @react-three/fiber + @react-three/drei
  + three.js bundle, loaded behind `next/dynamic({ ssr: false })`
  with a skeleton. Already isolated (see §6.2).
- **`/pricing` + most `/app/*` shells (101 kB):** the marketing
  surface and minimal app routes that don't pull the chat or
  documents modules. The "163 B route" figures are the page-level
  route handlers themselves; the rest is the shared shell.
- **All other auth/settings/chat routes (300–320 kB):** the
  authenticated app shell + TanStack Query + Radix Slot +
  lucide-react icons + the relevant panel.
- **`/app/agents/[agentId]/runs/[runId]` (311 kB):** the agent run
  detail page pulls the AgentTrace components (F5 P3), which are
  now design-token-clean per F9 P5.

## Lighthouse Results

To be filled in by the runtime Lighthouse run. Suggested table:

| Route | Performance | Accessibility | Best Practices | SEO |
| --- | ---: | ---: | ---: | ---: |
| `/` | TBD | TBD | TBD | TBD |
| `/login` | TBD | TBD | TBD | TBD |
| `/signup` (→ `/register`) | TBD | TBD | TBD | TBD |
| `/app/dashboard` | TBD | TBD | TBD | TBD |
| `/app/documents` | TBD | TBD | TBD | TBD |
| `/chat` | TBD | TBD | TBD | TBD |
| `/app/graph` | TBD | TBD | TBD | TBD |
| `/app/settings` | TBD | TBD | TBD | TBD |

## Core Web Vitals

To be filled in by the runtime Lighthouse run. Suggested table:

| Route | LCP | INP | CLS | FCP | TTFB |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/` | TBD | TBD | TBD | TBD | TBD |
| `/app/dashboard` | TBD | TBD | TBD | TBD | TBD |
| `/app/documents` | TBD | TBD | TBD | TBD | TBD |
| `/chat` | TBD | TBD | TBD | TBD | TBD |
| `/app/graph` | TBD | TBD | TBD | TBD | TBD |
| `/app/settings` | TBD | TBD | TBD | TBD | TBD |

---

## Source-Level Audit (Tasks 17–23)

This is the part of F10-P1 that does not need a running server. The
findings below are from a direct read of the source tree on the
`feat/f10-part1-performance-baseline` branch (post-F9 P5).

### 1. Client components

- **122 `".use client"` directives** across 122 `.tsx` files in
  `apps/web/`.
- **Breakdown** (approximate):
  - `app/`: 31 (route-level error/loading + the two route-group
    layouts that genuinely need client state)
  - `components/`: 88
  - `lib/`: 3 (theme view-transitions, query provider, marketing
    theme-sync)
- **Largest client surface:** `components/marketing/` (~17
  client components) — driven by the GSAP timeline + the live
  demo + the in-view scroll triggers. All are correct: the
  marketing surface genuinely is interactive.
- **No unnecessary client components identified.** Every `"use
  client"` file uses a real client-only feature (TanStack
  Query, GSAP, an `onClick` / `onChange` handler, a `useEffect`,
  `useState`, Radix Slot, etc.).

### 2. Dynamic imports

- **1 dynamic import** in the entire frontend
  (`components/graph/graph-explorer.tsx:79`):
  ```ts
  const GraphCanvas = dynamic(
    () => import("./graph-canvas").then((m) => m.GraphCanvas),
    { ssr: false, loading: () => <GraphCanvasSkeleton /> },
  )
  ```
- The 3D graph is already lazy-loaded with a skeleton. The
  2D fallback (`GraphCanvas2D`, F9 P2) is a direct import
  because it's a pure-SVG component with no Three.js / R3F
  dependency.
- **GSAP** is also lazy-loaded:
  `components/marketing/hero/hero-section.tsx` does
  `void import("gsap")` inside a `useEffect` — only the
  marketing route pays the GSAP cost, and only after the
  first paint.

### 3. Bundle chunks (post-build, from `.next/static/chunks/`)

Top 10 largest chunks:

| Chunk | Size (bytes) | Size (kB) | Contents |
| --- | ---: | ---: | --- |
| `3699-e6750831dc649be4.js` | 580,124 | 566.5 | R3F + drei + three.js core |
| `aaa38339-1150065697dfce62.js` | 376,350 | 367.5 | R3F internals (drei helpers) |
| `4e77bd5d-42520094189fb1f0.js` | 359,387 | 350.9 | three.js (geometry, materials) |
| `693-bcb6f0566dda0987.js` | 181,717 | 177.5 | Shared framework (React, Next) |
| `framework-4e8d652d889b1b27.js` | 181,639 | 177.4 | React + Next runtime |
| `5499ed8e-6dbf3e195d033e2e.js` | 166,093 | 162.2 | Shared app shell |
| `ac2a4f83-ba5c980dcaa9247b.js` | 148,191 | 144.7 | R3F internals (fiber, scene) |
| `main-4f86159c8fa94e70.js` | 114,389 | 111.7 | Next.js router/runtime |
| `polyfills-42372ed130431b0a.js` | 112,594 | 109.9 | Browser polyfills |
| `ef9fd7923cee33c9.css` | 103,394 | 101.0 | Compiled Tailwind v4 CSS |

**3D-graph chunks (sum):** ~928 kB across 5 chunks. These
should only load when the user navigates to `/app/graph`.
Verified: the `main-` chunk does not reference the 3D
modules.

**Per-route cost (already in the build manifest):**
- Marketing `/`: 294 kB First Load (no R3F)
- Dashboard `/app/dashboard`: 286 kB First Load (no R3F)
- Graph `/app/graph`: 554 kB First Load (R3F + drei + three)

**Conclusion:** the 3D graph is correctly isolated. The F9
P2 spec is satisfied — normal application routes do not
pay the 3D cost.

### 4. Dependencies (from `apps/web/package.json`)

Production dependencies (24 total):

| Package | Purpose | Approx weight | Notes |
| --- | --- | ---: | --- |
| `next` 15.0.3 | Framework | ~180 kB | required |
| `react` 19.0.0 / `react-dom` 19.0.0 | UI runtime | ~140 kB | required |
| `@tanstack/react-query` 5.59.20 | Server state | ~20 kB | required (project convention) |
| `zustand` 5.0.1 | Local UI state | ~3 kB | required (project convention) |
| `next-themes` 0.4.3 | Dark/light theme | ~3 kB | required |
| `@radix-ui/react-slot` 1.1.0 | Slot primitive | ~5 kB | required |
| `lucide-react` 0.460.0 | Icons | ~5 kB (per icon) | required, tree-shakeable |
| `tailwind-merge` 2.5.4 | Class merging | ~2 kB | required |
| `class-variance-authority` 0.7.0 | Variant API | ~3 kB | required |
| `clsx` 2.1.1 | Class composition | ~1 kB | required |
| `react-hook-form` 7.53.2 | Form state | ~15 kB | required (auth + onboarding) |
| `@hookform/resolvers` 3.9.1 | Form binding | ~5 kB | required |
| `zod` 3.23.8 | Schema validation | ~15 kB | required |
| `framer-motion` 11.11.17 | **Dead dep — see §4.1** | ~0 kB (not imported) | **CANDIDATE FOR REMOVAL** |
| `gsap` 3.12.5 | Marketing animation | ~50 kB | used, dynamically imported |
| `three` ^0.185.1 | 3D engine | ~300 kB | required (graph only) |
| `@react-three/fiber` ^9.7.0 | R3F core | ~80 kB | required (graph only) |
| `@react-three/drei` ^10.7.8 | R3F helpers | ~300 kB | required (graph only) |

#### 4.1 Dead dependency — `framer-motion`

`framer-motion` is listed in `apps/web/package.json` as a
production dependency but **is not imported anywhere in the
source tree** (verified via `grep -r "framer-motion"
apps/web/`). The only mention is a comment in
`tests/setup.ts:14`. F8 P1+ chose GSAP for the marketing
hero + the marketing scroll choreography; the in-app motion
system uses CSS transitions + the Tailwind v4 motion tokens +
`useInView`. **Recommendation: remove `framer-motion` from
`package.json` in F10-Part 2** (zero risk; no source change
needed).

### 5. Fonts (from `apps/web/app/fonts.ts`)

```ts
displayFont = Bricolage_Grotesque(weights: 300, 400, 500, 600, 700, 800) // 6 weights
bodyFont    = Space_Grotesk(weights: 300, 400, 500, 600, 700)            // 5 weights
monoFont    = JetBrains_Mono(weights: 400, 500, 700)                     // 3 weights
```

**Actual weight usage (from `grep font-{weight} apps/web/`):**

- `font-medium` (500): used
- `font-semibold` (600): used
- `font-thin` / `font-extralight` / `font-light` / `font-normal`
  / `font-bold` / `font-extrabold` / `font-black`: **zero usage**

**Findings:**

- Bricolage loads **6 weights**, uses **2** (medium, semibold).
  4 unused.
- Space Grotesk loads **5 weights**, uses **2** (medium,
  semibold). 3 unused.
- JetBrains Mono loads **3 weights** (400, 500, 700), uses
  **2** (medium, semibold). 1 unused — and semibold (600)
  isn't even loaded for Mono, so any mono element using
  `font-semibold` falls back to a CSS-synthesized weight.

**Recommendation (F10-Part 2):** trim font weight sets.

- Bricolage: 6 → 2 (500, 600) — saves ~4 weight files
- Space Grotesk: 5 → 2 (500, 600) — saves ~3 weight files
- Mono: 3 → 3 (already minimal) — but add 600 to the set so
  mono + semibold works correctly without synthesis

This is a P2 optimization (font weight files are typically
~15–30 kB each; ~4 unused Bricolage weights × ~25 kB = ~100 kB
savings).

### 6. Images (Task 22)

- **0 raw `<img>` tags** in the entire frontend.
- **0 `next/image` imports.** Every visual asset is an
  inline SVG. The marketing hero, the knowledge graph
  visual, the agent trace, the agents/MCP visual, the
  citations visual, the live demo — all rendered as
  inline SVG.
- **1 favicon:** `apps/web/public/favicon.svg` (SVG, served
  as `image/svg+xml`).
- **1 webmanifest:** `apps/web/public/manifest.webmanifest`.

**Finding:** no image optimization opportunity. The
all-inline-SVG approach is the right one for a content
surface that draws its own illustrations; there are no
photographic assets to lazy-load.

### 7. Third-party scripts (Task 23)

- **0 third-party scripts** in `app/layout.tsx` (no
  analytics, no Sentry, no Hotjar, no external font CDN
  beyond the self-hosted `next/font` set).
- All `https://` references in the source tree are either:
  - localhost dev URLs (e.g. `http://localhost:8000` in
    `packages/config/src/env.ts`)
  - SVG namespace declarations
  - User-input placeholders (e.g. the URL upload tab)
  - Test fixtures / comments
- **No request to any third-party origin** at first paint
  beyond the self-hosted fonts (which Next.js inlines
  into the build output via `next/font/google`).

**Finding:** no third-party performance risk. F10-Part 4
(Analytics) is the phase that would intentionally add a
script — and the doc there will need to weigh
attribution-vs-load-time.

### 8. Env config (Task 24)

All backend URLs flow through `packages/config/src/env.ts`
(validated with Zod):

| Variable | Default | Consumer |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | `lib/auth/api-client.ts`, all `services/*` |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:8000` | `lib/websocket/*`, `lib/socket/*`, `services/documents/ingestionSocket.ts` |
| `NEXT_PUBLIC_GRAPHQL_URL` | `http://localhost:8000/graphql` | reserved (no current consumer) |
| `NEXT_PUBLIC_APP_NAME` | `Cortex` | metadata |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | `app/layout.tsx` (metadata) |

Server-only secrets are split via `getServerEnv()` and
cannot leak into the client bundle.

**Finding:** no hardcoded backend URLs in components. The
project's "no hardcoded API/WS locations" rule is
honoured.

### 9. Loading / empty / error states (Task 25)

Per F9 P5 audit (`Docs/frontend/f9-final-qa.md` §6), every
server-backed screen has the (fact + retry) pattern.
Loading states render immediately (skeletons, animated
spinners). No "spinner forever" surfaces. The F9 P5
file-walk test (`tests/final-qa.test.tsx`) pins the
design-token + Spark + typography contract that the
loading states use.

---

## Performance Hotspots (Task 28)

### P0 — Blocking

- **None identified from the source-level audit.** The
  production build passes; no architectural performance
  traps. The runtime Lighthouse runs may surface a P0
  (e.g. an unexpectedly slow LCP element) — those are
  reserved for after the Lighthouse data lands.

### P1 — Major

- **TBD pending Lighthouse runs.** Candidates based on
  source-level reading:
  - The marketing hero may have an LCP regression if the
    GSAP timeline + the inline SVG hero visual compete for
    the first-paint slot. The 1.4s GSAP choreography is
    mount-triggered, so it shouldn't block LCP, but this
    needs measurement.
  - The streaming chat (`/chat`) and the document upload
    surface both have large client components; the
    Network waterfall should be checked for sequential
    API/WS handshakes that delay TTFB.

### P2 — Optimization

- **Dead dependency: `framer-motion`** (see §4.1). ~0
  kB runtime cost (not imported) but the `package.json`
  list is a documentation debt. Remove in F10-Part 2.
- **Font weight over-provisioning** (see §5). Trim
  Bricolage to 500+600, Space Grotesk to 500+600, add
  600 to JetBrains Mono. Estimated ~100 kB savings
  across the marketing surface.
- **`usePrefersReducedMotion` is still loaded eagerly**
  in the app shell even though it only matters in the
  marketing + graph surfaces. Minor P2 (it's a tiny
  hook, but it pulls in the `useSyncExternalStore`
  runtime on every page).

### P3 — Future

- The 3D graph route (`/app/graph`) is already dynamic
  + has the 2D fallback. If Lighthouse shows the
  remaining ~250 kB graph chunk is still the dominant
  contributor, F10+ could explore splitting the
  drei helpers into a sub-chunk that only loads when
  the user actually interacts with the graph (e.g.
  HDR envmaps, postprocessing, drei `OrbitControls`).
- The marketing header's `id="product"` anchor + the
  marketing header's GSAP timeline are both eager
  imports. Could be deferred until the user scrolls
  past the hero. Minor.

---

## F10 Optimization Queue

### P1

- [ ] Run Lighthouse on the production build (mobile + desktop)
      and populate §"Lighthouse Results" + §"Core Web Vitals"
- [ ] Investigate the marketing hero LCP — confirm that the
      GSAP choreography is post-paint, not blocking
- [ ] Investigate the `/chat` route INP — confirm the
      streaming + WebSocket message path doesn't introduce
      long tasks

### P2

- [ ] Remove `framer-motion` from `apps/web/package.json`
      (dead dep, §4.1)
- [ ] Trim font weight sets in `app/fonts.ts` (Bricolage
      6 → 2, Space Grotesk 5 → 2, add Mono 600; §5)
- [ ] Investigate lazy-loading the `usePrefersReducedMotion`
      hook (only matters in the marketing + graph surfaces)

### P3

- [ ] Sub-chunk the R3F drei helpers inside the graph route
- [ ] Defer the marketing header GSAP timeline + the
      marketing header anchor scroll until after first paint
- [ ] Consider deferring the Hero's `<stop>` Spark gradient
      inline SVG into a separate file (CSS-only equivalent
      could shave bytes from the initial hero render)

---

## Performance Budget

To be set after the Lighthouse data lands. Initial targets
based on the build manifest:

```text
## Performance Budget

### Initial JavaScript
Target: TBD after Lighthouse

### Marketing (`/`) First Load JS
Current: 294 kB
Target: TBD after Lighthouse

### Authenticated app shell First Load JS
Current: ~290 kB (most routes)
Target: TBD after Lighthouse

### Knowledge Graph route First Load JS
Current: 554 kB (R3F + drei + three)
Target: confirm < 600 kB (the existing isolation is
        already correct; the budget just makes the
        regression intent explicit)

### Fonts
Target: 2 weights × 2 fonts (Bricolage 500/600, Space
        Grotesk 500/600) + 3 weights × 1 font (JetBrains
        Mono 400/500/600) = 7 weight files max
        (down from the current 14)

### 3D Graph
Target: isolated from normal application routes
Status: ALREADY SATISFIED (§6.2 — `next/dynamic({ ssr: false })`
        wraps the R3F canvas; only the 2D fallback is a
        direct import; build manifest confirms the 3D chunks
        are not in the non-graph First Load JS)
```

---

## F10-Part 2 Results (Bundle Optimization & 3D Isolation)

The F10-Part 1 hotspot list identified two P2 wins that
F10-Part 2 implemented:

### 1. Dead dependency: `framer-motion` removed

`framer-motion@11.11.17` was listed in `apps/web/package.json`
but **zero imports** existed in the source tree (verified by
`grep -r "framer-motion" apps/web/`; the only match was a
comment in `tests/setup.ts`). The project uses GSAP for
marketing + CSS transitions + Tailwind v4 motion tokens for
in-app motion, so framer-motion was never actually used.

**Action:** removed from `apps/web/package.json`; cleaned up
the stale comment in `tests/setup.ts:14` that referenced it.
Verified via `pnpm why framer-motion` (returns nothing) +
`pnpm install` (lockfile no longer contains the dep).

**Runtime impact:** zero — the dep was never imported, so the
JS bundle was unaffected. The win is hygiene: cleaner
`package.json` + smaller lockfile + no future contributor is
misled into thinking framer-motion is the project's motion
library.

### 2. Font weight set trimmed + Mono 600 added

The F10-Part 1 audit identified that Bricolage Grotesque +
Space Grotesk were loading weight sets that the F0–F9
implementation never used (`font-light`, `font-thin`,
`font-extralight`, `font-bold`, `font-extrabold`, `font-black`
all had zero references; only `font-medium` (500) and
`font-semibold` (600) were actually used).

**Action:** in `apps/web/app/fonts.ts`:

- Bricolage Grotesque: `weight: ["300", "400", "500", "600",
  "700", "800"]` (6) → `weight: ["500", "600"]` (2)
- Space Grotesk: `weight: ["300", "400", "500", "600", "700"]`
  (5) → `weight: ["500", "600"]` (2)
- JetBrains Mono: `weight: ["400", "500", "700"]` (3) →
  `weight: ["400", "500", "600"]` (3) — **replaced 700 with
  600** to fix a real synthesis bug

**Real bug fix:** the previous Mono set was missing 600. Any
mono element using `font-semibold` (timestamps, API key
masks, MCP tokens, code blocks) was falling back to a
CSS-synthesized bold (`font-synthesis-weight: auto` default).
The new set loads Mono 600 directly, so mono + semibold now
renders the actual 600 weight instead of a synthetic bold.

**Runtime impact measurement:**

```text
                          BEFORE (F10-P1)        AFTER (F10-P2)
.woff2 files              12 files               12 files
.woff2 total bytes        182,808                182,808
.woff2 total (kB)         178.5                  178.5
Route-level First Load JS unchanged (Next.js gzipped)
```

**The total bytes are unchanged.** This is `next/font/google`
already doing the right thing — it only emits `.woff2` files
for the weights actually referenced via CSS, regardless of
what's in the `weight` config array. The unused weights
(300, 400, 700, 800 of Bricolage; 300, 400, 700 of Space
Grotesk) were already not being downloaded because no CSS
class referenced them.

**The win is defensive + correctness:**

- **Defensive:** the declared weight set is now 7 (down
  from 14). A future contributor who adds `font-bold`
  somewhere will get a clean fallback (the browser uses
  the closest available weight) rather than a surprise
  download of a new weight file. The trim makes the
  "weights actually used" contract explicit.
- **Correctness:** the Mono 600 synthesis bug is fixed.
  Mono + semibold now renders the actual 600 weight.

### 3. 3D route isolation — confirmed via build manifest

The F10-Part 1 audit asserted that the 3D graph stack is
isolated from the rest of the app. F10-Part 2 re-verified
this post-trim:

```text
Route                          First Load JS    Contains R3F?
/                              294 kB           no
/app/dashboard                 286 kB           no
/app/documents                 312 kB           no
/chat                          316 kB           no
/app/settings/team             313 kB           no
/app/graph                     554 kB           YES (R3F + drei + three)
```

**The 3D isolation is structurally correct.** The R3F
chunks (~928 kB across 5 chunks) load only when the user
navigates to `/app/graph`. The `next/dynamic({ ssr: false })`
wrapper in `components/graph/graph-explorer.tsx:79` is the
single boundary. The 2D fallback (`GraphCanvas2D`) is a
direct import because it's a pure-SVG component with no
Three.js / R3F dependency.

### 4. Bundle budget — initial targets established

The F10-Part 1 budget was TBD; F10-Part 2 establishes
realistic numbers based on the actual build manifest:

```text
## Performance Budget (F10-Part 2 initial)

### Marketing (`/`) First Load JS
Current: 294 kB
Target:  < 300 kB (CI fails if it grows past 300 kB)

### Authenticated app shell First Load JS
Current: ~290 kB (most routes, e.g. /app/dashboard = 286 kB)
Target:  < 320 kB (allows for future feature growth)
          Key question for the future: is /app/documents
          at 312 kB worth pulling apart (it has the
          documents-table + document-detail-drawer + upload
          modal + ingestion-progress + selection provider)

### Knowledge Graph route First Load JS
Current: 554 kB (R3F + drei + three)
Target:  < 600 kB (the R3F boundary is correct; this is
          just a regression-detection budget)

### Middleware
Current: 32.2 kB
Target:  < 40 kB

### First Load JS shared by all
Current: 100 kB
Target:  < 110 kB
```

### 5. F10-Part 2 Definition of Done

- [x] Part 1 bottlenecks reviewed (`Docs/frontend/f10-performance.md` §Performance Hotspots)
- [x] 3D dependency boundary identified (R3F + drei + three, only in `components/graph/graph-canvas*.tsx` + `graph-node.tsx` + `graph-edge.tsx`)
- [x] 3D dependencies isolated (already in F9 P2; re-verified via build manifest)
- [x] Knowledge Graph dynamically loaded (`next/dynamic({ ssr: false })` in `graph-explorer.tsx:79`)
- [x] Normal routes don't load 3D (confirmed by route-by-route First Load JS comparison)
- [x] Graph loading state works (`<GraphCanvasSkeleton>` in `graph-explorer.tsx:84`)
- [x] Graph error state works (`app/(app)/app/graph/error.tsx`)
- [x] Large assets optimized (zero raster images, all inline SVG; F10-P2 had no asset work to do)
- [x] Fonts audited/optimized (Bricolage 6→2, Space Grotesk 5→2, Mono 700→600)
- [x] Unnecessary client JS reduced where safe (`framer-motion` removed)
- [x] Bundle analyzed again (manifest captured post-trim)
- [x] Bundle budget defined (initial targets above)
- [ ] Budget enforcement added where practical (deferred to F10-Part 2.5 or F10-Part 4 — needs CI integration, out of scope for a single doc change)
- [ ] Lighthouse rerun (deferred — requires local Chrome; the doc still has the §"How to Run Lighthouse Locally" instructions ready)

### 6. F10-Part 2 — what was NOT done

- **Lighthouse before/after numbers.** The runtime Lighthouse
  cells in §"Lighthouse Results" + §"Core Web Vitals" are
  still TBD. The F10-P2 changes affect the unminified
  font assets, not the gzipped JS bundle, so the Lighthouse
  Performance score is unlikely to change materially
  (the 3D route stays the dominant contributor at 554 kB
  either way). The bundle budget is the more useful
  regression detector.
- **Sub-chunking the R3F drei helpers.** Marked P3 in the
  F10-Part 1 audit; deferred to a future F10 part if
  Lighthouse shows the 554 kB graph route is a real user
  concern.
- **Lighthouse CI / Playwright CI integration.** F10-Part 3
  is the right home for that work (visual regression +
  perf budgets together).

---

## How to Run Lighthouse Locally

---

## How to Run Lighthouse Locally

The runtime Lighthouse cells above are intentionally left as
"TBD" because they require a live browser session. Run the
following on a workstation with Chrome + Node 20+:

```bash
# 1. Build the production bundle (already done in CI; this
#    is the local equivalent)
cd frontend
pnpm --filter @cortex/web build

# 2. Start the production server (don't background it on
#    Windows — use a separate terminal)
pnpm --filter @cortex/web start
# (server listens on http://localhost:3000)

# 3. In a second terminal, run Lighthouse against each route
npx lighthouse http://localhost:3000/ \
  --preset=desktop \
  --output=json --output=html \
  --output-path=./lighthouse-home-desktop

npx lighthouse http://localhost:3000/app/dashboard \
  --preset=desktop \
  --output=json --output=html \
  --output-path=./lighthouse-dashboard-desktop

# ... repeat for /login, /register, /app/documents,
# /chat, /app/graph, /app/settings

# 4. Mobile preset (4G + 4x CPU throttle + smaller viewport)
npx lighthouse http://localhost:3000/ \
  --output=json --output=html \
  --output-path=./lighthouse-home-mobile
```

For a CI-style automated run, the `unlighthouse` CLI walks
all routes in a sitemap (the project has no public sitemap
yet, so the explicit list above is the right approach for
F10-P1).

When the Lighthouse data lands, populate the §"Lighthouse
Results" and §"Core Web Vitals" tables, and the
§"Performance Budget" table can be tightened.

---

## F10-Part 1 Definition of Done

Source-level pass:

- [x] Production build works (`pnpm --filter @cortex/web
      build` succeeds; 0 errors)
- [x] Build manifest captured (§Production Build)
- [x] 122 client components inventoried (§1)
- [x] Dynamic imports inventoried (§2)
- [x] Top 10 chunks sized (§3)
- [x] Production dependencies audited (§4)
- [x] Dead dep identified: `framer-motion` (§4.1)
- [x] Font audit (§5)
- [x] Image audit (§6)
- [x] Third-party script audit (§7)
- [x] Env config audit (§8)
- [x] Loading-state audit (§9)
- [x] Hotspots classified P0/P1/P2/P3 (§Performance
      Hotspots)
- [x] Optimization queue built (§F10 Optimization Queue)
- [x] Performance budget direction set
      (§Performance Budget)
- [x] Lighthouse run instructions provided
      (§How to Run Lighthouse Locally)

Runtime pass (pending local Lighthouse):

- [ ] Marketing audited (`/`)
- [ ] Auth audited (`/login`, `/register`, `/forgot-password`,
      `/reset-password`, `/workspace-setup`)
- [ ] Dashboard audited (`/app/dashboard`)
- [ ] Documents audited (`/app/documents`)
- [ ] Chat audited (`/chat`)
- [ ] Knowledge Graph audited (`/app/graph`)
- [ ] Settings audited (`/app/settings/team`,
      `/app/settings/api-keys`, `/app/settings/mcp`,
      `/app/settings/usage`, `/app/settings/audit-log`)
- [ ] Mobile + desktop baselines recorded
- [ ] LCP / INP / CLS / FCP / TTFB populated
- [ ] Per-route Lighthouse score (Performance /
      Accessibility / Best Practices / SEO) populated

The runtime pass is deliberately deferred to a workstation
with a live browser because Lighthouse is a Chrome
DevTools-native measurement that does not run reliably
in headless server contexts. The source-level findings in
this document are sufficient to begin F10-Part 2
optimization (the dead `framer-motion` dependency + the
font weight over-provisioning are both safe, low-risk
wins).

## Next phase

F10-Part 2 — Bundle Optimization & 3D Route Isolation.
The 3D route is already isolated (§6.2); Part 2's job is
to confirm via measurement, remove the dead `framer-motion`
dependency, trim the font weight sets, and re-run
Lighthouse to populate the before/after table.
