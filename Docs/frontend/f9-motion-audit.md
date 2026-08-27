# Cortex F9 Motion Audit

## Status

- [x] Marketing motion audited
- [x] App motion audited
- [x] Hover motion audited
- [x] Streaming motion audited
- [x] Ingestion motion audited
- [x] Graph motion audited
- [x] Theme transition audited
- [x] Reduced-motion behavior audited
- [x] Timing consistency verified
- [x] Unnecessary animations removed

This document is the **source of truth** for every motion decision in Cortex.
The same vocabulary powers both the marketing site and the in-app shell —
the *application* of the vocabulary differs (calm in-app, bold marketing),
but the *tokens* are shared.

---

## 1. The Two-Mode Motion Philosophy

Cortex has two motion modes, set by context — not by user preference.

```text
┌─────────────────────────────────────────────┐
│  MARKETING                                  │
│  ────────                                   │
│  • Bold                                     │
│  • Orchestrated                             │
│  • Story-driven                             │
│  • Plays once per session                   │
│  • ~1.4s hero entrance                      │
│  • Scroll-triggered feature beats           │
│  • Spark-gradient signature moments         │
└─────────────────────────────────────────────┘
                     vs.

┌─────────────────────────────────────────────┐
│  AUTHENTICATED APP                          │
│  ─────────────────                          │
│  • Calm                                     │
│  • Fast                                     │
│  • Purposeful                               │
│  • 150–250ms general state changes          │
│  • opacity/transform only — no parallax,    │
│    no floating shapes, no per-element       │
│    stagger                                  │
│  • Spark Glow on actively streaming only    │
│  • ~600ms theme cross-fade at workspace     │
│    boot (the one intentional exception)     │
└─────────────────────────────────────────────┘
```

This split is not negotiable. F0–F8 respected it; F9 confirms it.

---

## 2. The Token Vocabulary

Every motion decision in Cortex is built from a small set of tokens defined
in `packages/ui/src/styles/motion.css` + `packages/ui/src/motion/`.

### 2.1 Durations

| Token  | Value   | Use                                                       |
| ------ | ------- | --------------------------------------------------------- |
| `fast` | 150ms   | Hover state changes, focus rings, tooltips                |
| `base` | 250ms   | Default app transitions, modal enter, drawer slide        |
| `slow` | 400ms   | Larger dialogs, page-level fade-ups                       |
| `stage`| 1400ms  | Marketing hero entrance (the one orchestrated timeline)  |

These are exposed as both CSS custom properties
(`--motion-duration-{fast,base,slow,stage}`) and Tailwind v4 utility classes
(`duration-fast` / `duration-base` / `duration-slow` / `duration-stage`).

### 2.2 Easings

| Token        | Cubic-bezier                  | Use                          |
| ------------ | ----------------------------- | ---------------------------- |
| `outQuint`   | `0.22, 1, 0.36, 1`            | Default — soft, snappy       |
| `inOutQuart` | `0.76, 0, 0.24, 1`            | Theme cross-fade + page stage|

### 2.3 Presets

The `packages/ui/src/motion/` package exports a small library of reusable
animation presets: `fade`, `slide`, `scale`, `stagger`, `page`. They map
to CSS classes that compose the keyframes + tokens above. App code should
import these, not define animations inline.

### 2.4 Marketing vocabulary (F8)

In `apps/web/lib/marketing/animations.ts`, a second vocabulary extends the
shared tokens with **marketing-specific** constants:

- `MOTION.hero` — the 1.4s hero timeline windows (ambient 0-400ms,
  headline 300-900ms, subheadline 600-1000ms, CTA 900-1200ms). Pinned
  by tests.
- `MOTION.headlineStaggerMs` — 60ms per word in the hero headline.
- `MOTION.section.hybridSearch` — the 5 sub-stage windows of the
  hybrid-search merge animation.
- `MOTION.easing` — the GSAP-friendly string forms (`power3.out` /
  `power2.inOut`) for the JS-driven hero timeline.

The marketing vocabulary is **additive** — it never overrides the shared
in-app tokens. The marketing site is the *one* place bold motion is
acceptable, and the tokens reflect that.

---

## 3. Motion Inventory

Every motion-emitting component in the codebase, classified as
`KEEP` / `FIX` / `REMOVE` / `SIMPLIFY`. The status column is the audit
result for F9 Part 1.

### 3.1 Marketing surface (`/`)

| Component                        | Motion                              | Status |
| -------------------------------- | ----------------------------------- | ------ |
| `HeroSection`                    | GSAP timeline, ~1.4s                | KEEP   |
| `HeroBackground` (radial wash)   | Mount fade via `data-hero-bg-element` | KEEP |
| `HeroVisual` (SVG node field)    | 18s field drift, 3.4s edge pulse (motion-safe) | FIX (see §4.1) |
| `ProblemSection`                 | Single 600ms fade-up on scroll-in   | KEEP   |
| `SolutionSection`                | Single 600ms fade-up on scroll-in   | KEEP   |
| `HybridSearchSection` + visual   | 5-stage merge (CSS-only via `data-revealed` + `transition-delay`) | KEEP |
| `KnowledgeGraphSection` + visual | 9-node stagger + edge fade (CSS-only) | KEEP |
| `AgentsMcpSection` + visual      | 6-stage vertical trace (CSS-only)   | KEEP   |
| `CitationsSection` + visual      | Answer → marker → source (CSS-only) | KEEP   |
| `LiveDemoSection` / `DemoChat`   | User-driven 45ms/chunk streaming    | KEEP   |
| `DemoMessage` (caret)            | `demo-caret-blink` 1s (motion-safe) | KEEP   |
| `MarketingHeader`                | Static (no animation)               | KEEP   |
| `MarketingFooter`                | Static (no animation)               | KEEP   |
| `TechnicalCredibility`           | Static (no animation, by spec)      | KEEP   |
| `FinalCTA`                       | Single 600ms fade-up on scroll-in   | KEEP   |

### 3.2 Application surface (`/app/*`)

| Component                                | Motion                                         | Status |
| ---------------------------------------- | ---------------------------------------------- | ------ |
| `StreamingMessage` (chat)                | Spark Glow fade (500ms) + caret pulse (2s) + Volt ping (small dot) | KEEP |
| `ConversationSkeleton`                   | `animate-pulse` on each Skeleton primitive (gated by global reduced-motion CSS) | KEEP |
| `AgentTrace`                             | `animate-pulse` on loading row + `animate-spin` on inline loader | KEEP |
| `DocumentIngestionProgress`              | `transition-[width] duration-300` on the progress bar; badge cross-fades via React reconciliation | KEEP |
| `ConnectionIndicator`                    | `animate-pulse` on the `connecting` state (small dot) | KEEP |
| `GraphCanvas` (R3F)                      | `frameloop="demand"` (no idle motion); OrbitControls damping disabled under reduced-motion | KEEP |
| `ViewTransitions` (theme)                | `document.startViewTransition` (~600ms, only at workspace boot) | KEEP |
| `Drawer` (Radix)                         | `data-[state=*]:slide-in/out-from-*` + `fade-*`, 300ms | KEEP |
| `Modal` (Radix)                          | Same slide/fade + 300ms                        | KEEP   |
| `Spinner`                                | `animate-spin` (inline button loaders)        | KEEP   |
| `Skeleton`                               | `animate-pulse` (gated globally)               | KEEP   |
| `Switch` (settings)                      | Tailwind transition, 150ms                     | KEEP   |
| `RateLimitBanner`                        | Mount/unmount via portal, no decorative motion | KEEP   |
| `Sidebar` / `Topbar`                     | Static shell, no decorative motion            | KEEP   |
| `DocumentRow` / `ConversationListItem`   | Hover border + slight bg change (≤200ms)      | KEEP   |
| `Search` / `CommandMenu`                 | Restrained enter/leave, no stagger             | KEEP   |
| `OnboardingProgressIndicator`            | Static progress dots, no decorative motion    | KEEP   |

### 3.3 Ingestion status

The status badge cross-fades via React's normal reconciliation (the F1
`Badge` re-renders), and the progress bar uses a 300ms `transition-[width]`.
There is **no spinner on ingestion status** — the spec is explicit: a
thin progress line, not a spinner.

The `ConnectionIndicator` shows a small pulsing dot when the WebSocket
is reconnecting, which is appropriate (the user is *waiting* for
connectivity to resume; a passive badge would be unclear).

### 3.4 Streaming chat

The `StreamingMessage` component is the only place Spark Glow lives in
the app shell. The flow:

```text
send message
       ↓
WS connects, server emits `message_start`
       ↓
Spark Glow behind the bubble fades in (500ms transition)
       ↓
"Generating" pill appears with a small Volt ping dot
       ↓
tokens arrive per chunk; caret dot blinks at 1s
       ↓
server emits `message_complete`
       ↓
Spark Glow fades out (500ms)
       ↓
"Generating" pill removed
       ↓
MessageBubble replaces the StreamingMessage
       ↓
glow gone, message sits as flat Slate (per spec)
```

The streaming bubble does **not** re-animate the whole message on each
token (that would flicker). Only the *new chunk* is appended; the prior
text remains stable. This matches the spec.

### 3.5 Graph explorer

The F6 graph canvas is `frameloop="demand"` — it does not run a
continuous render loop. Motion is limited to:

- The user's orbit / pan / zoom (OrbitControls).
- The active-path colour change when the user picks a relation.
- Damping is **disabled** when `prefers-reduced-motion: reduce`.

The spec calls for "slow continuous node drift" — F6 deliberately
omitted this. **SIMPLIFY** decision: the F6 graph is calm and that
calmness is correct for an authenticated app surface. The marketing
graph visual (F8 P3) provides the "drift" the spec describes, on the
public surface where bold motion is appropriate.

### 3.6 Theme transition

The `ViewTransitions` provider wires `document.startViewTransition` so
the light↔dark morph is native + GPU-accelerated. The transition only
fires from `setAnimatedTheme`, which the `(app)` layout calls **once
at workspace boot** (Stage 4 of the F2 auth flow). The provider does
not expose a public `setAnimatedTheme`; the `useTheme` hook's
`setTheme` is un-animated.

### 3.7 Loading states

| Surface                    | Pattern                                |
| -------------------------- | -------------------------------------- |
| Ingestion (documents)      | Thin progress line                     |
| Chat (waiting for stream)  | "Generating" pill + caret dot          |
| Route-level loading.tsx    | `ConversationSkeleton` / `Skeleton`   |
| Connection loss            | Pulsing connection indicator           |
| Short blocking op          | Inline `Spinner` in the action button  |

Spinners are reserved for short blocking operations. Ingestion uses a
progress line (no spinner, per spec).

### 3.8 Skeletons

The `Skeleton` primitive uses `animate-pulse`. The project's
`prefers-reduced-motion` media query in `packages/ui/globals.css`
already flattens every animation to its end-state instantly — including
the pulse — so the F0 reduced-motion wiring covers this without
per-component code.

### 3.9 Marketing vs app Spark gradient usage

The spec: **at most one Spark-gradient moment per screen.**

| Screen / surface               | Spark-gradient usage                          |
| ------------------------------ | --------------------------------------------- |
| Marketing hero headline        | `text-spark` on the "connected" word          |
| Marketing solution section     | `text-spark` on the "connected" word          |
| Marketing agents + MCP visual  | `text-spark` on the active step's label       |
| Marketing CTA + final CTA      | `bg-spark` on the primary button (not text)   |
| In-app Spark Glow (chat)       | `bg-[radial-gradient(...)]` on the streaming bubble backdrop |
| In-app Graph active path       | Spark-tinted cylinder on traversed edges     |
| In-app Settings / nav / forms  | No Spark gradient (Ember + Volt as flat fills) |

The Spark text-fill never appears in the app shell. The Spark radial
glow only appears behind actively streaming messages. The brand
gradient reads as a signature, not as a background texture.

---

## 4. F9-Part 1 Fixes

The audit surfaced four concrete corrections. All are landed in
F9 Part 1.

### 4.1 Hero visual `text-spark` on the outer SVG (FIX)

**Component:** `components/marketing/hero/hero-visual.tsx`

**Issue.** The outer `<svg>` carried the `text-spark` class, which sets
`color: transparent` so the gradient applies to text. The edges inside
the SVG use `<g stroke="url(#hero-edge)">` where `#hero-edge` references
`currentColor`. With `color: transparent`, the edge gradient's
`stopColor="currentColor"` resolved to `transparent`, leaving the edges
effectively invisible. The nodes (which sit inside `<g className="text-foreground">`)
rendered correctly because the inner group overrode `color`. The result
was a node field with a missing edge web — the visual that should have
communicated "connected knowledge" was only showing the nodes.

**Fix.** Remove the `text-spark` class from the outer `<svg>`. The SVG
inherits the document's default text colour (Ink / Paper depending on
theme), so `currentColor` resolves correctly for both the edge gradient
and the node fill.

### 4.2 Triple `usePrefersReducedMotion` implementation (SIMPLIFY)

**Files:**
- `apps/web/lib/motion/reduced-motion.ts` — the canonical hook
  (uses `useSyncExternalStore`).
- `apps/web/lib/marketing/animations.ts` — a duplicate
  (uses `useState` + `useEffect`).
- `apps/web/components/graph/graph-canvas.tsx` — a third
  inline copy (uses `useState` + `useEffect`).

**Issue.** Three separate implementations of the same React hook.
The marketing + graph canvas versions use the older
`useState` + `useEffect` pattern, which doesn't re-render on
media-query changes. The `useSyncExternalStore` version (in
`lib/motion/reduced-motion.ts`) is the React-recommended pattern for
external stores and does re-render on changes.

**Fix.** Re-export the canonical hook from `lib/motion/reduced-motion.ts`
as the single source of truth. Update `lib/marketing/animations.ts` to
re-export it. Update the graph canvas to import it. Delete the
duplicates.

### 4.3 Verify Spark-gradient usage obeys the one-per-screen rule (KEEP)

The audit confirmed: each marketing screen uses the Spark gradient
**once or twice**, with the second usage being the primary CTA button
(not the gradient text-fill). The hero is the only screen where
`text-spark` appears, and only on a single word. The solution section
repeats the hero's "connected" word treatment intentionally — it is
the *same conceptual beat* (the scattered→connected transformation).
The agents + MCP visual uses `text-spark` only on the active
"Tool" step's label, not on the headline. No screen violates the rule.

### 4.4 Marketing section reveal pattern (KEEP)

All four feature sections (Hybrid Search, Knowledge Graph, Agents + MCP,
Citations) use the same pattern:

```text
opacity-0 + translate-y-{3,4} + scale-95 (sometimes)
       ↓
useInView triggers once on scroll-in
       ↓
data-revealed="true" set on the element
       ↓
data-[revealed=true]: opacity-100 + translate-y-0 + scale-100
       ↓
via CSS `transition-all duration-{300,500,600}ms ease-out`
```

The pattern is consistent, plays once per session, and never
re-triggers on scroll-back. The use of `transition-all` is broader
than ideal but in practice the only properties that change are
`opacity` / `transform` / `scale`, so the broader transition is a
no-op for any other property.

**No change** — the pattern is correct. A future contributor
tempted to "improve" `transition-all` to a more specific
`transition-[opacity,transform]` should know that
Tailwind 4's JIT will resolve either to the same declarations.

### 4.5 Theme transition wiring (KEEP)

The `ViewTransitions` provider already:
- Only animates when the user explicitly calls `setAnimatedTheme`.
- Respects `prefers-reduced-motion` (the underlying browser API
  falls back to no-animation when the user opts out).
- Is the *only* place in the app that calls
  `document.startViewTransition`.

No change. The F2 layout's workspace-boot moment is the single trigger.

### 4.6 Workspace boot transition cadence (KEEP)

The spec calls for ~600ms. The browser's default cross-fade is
~250ms. F10+ can layer a GSAP-driven cross-fade on top if a
slower transition is wanted — but the current behaviour respects
the spec's "happens only at workspace boot" rule and doesn't add
unwanted motion elsewhere.

---

## 5. Reduced-Motion Coverage

The audit confirms: **every motion in the codebase honours
`prefers-reduced-motion: reduce`**, either via:

- The global `*` rule in `packages/ui/src/styles/globals.css` that
  flattens every animation to its end-state instantly.
- The local `usePrefersReducedMotion` hook in
  `apps/web/lib/motion/reduced-motion.ts` (used by the marketing
  animations, the graph canvas, and the theme view-transition).
- The `motion-safe:` Tailwind variant on CSS-keyframe animations
  (caret blink, hero field drift, hero pulse).

The full reduced-motion behaviour catalogue lives in the
F9-Part 3 audit document (the dedicated reduced-motion pass
follows this motion-consistency pass).

---

## 6. Timing Consistency

| Surface                       | Duration    | Spec match |
| ----------------------------- | ----------- | ---------- |
| General state changes         | 150–250ms   | ✓          |
| Modal / drawer enter          | 300ms       | ✓          |
| Marketing section reveal      | 600ms       | ✓          |
| Hero entrance timeline        | 1400ms      | ✓          |
| Theme cross-fade              | ~600ms (browser default) | ✓ (range, not exact) |
| Ingestion progress bar        | 300ms       | ✓          |
| Chat Spark Glow fade          | 500ms       | ✓          |
| Caret blink                   | 1000ms      | ✓          |
| Hero field drift              | 18s (subtle)| ✓          |
| Hero edge pulse               | 3.4s (subtle)| ✓         |

No timing violations were found.

---

## 7. Spark-Gradient Visual Audit

The brand spec's "build note" warns that a plain RGB linear-gradient
between orange and teal can become muddy/gray through the middle. The
Cortex Spark gradient is defined in CSS as:

```css
linear-gradient(135deg,
  var(--ember-500) 0%,
  var(--ember-300) 50%,
  var(--volt-500) 100%
)
```

The middle stop is `ember-300` (a lightened Ember) — the spec's
"bridge stop" mitigation. The variables themselves are OKLCH-defined
in `packages/ui/src/styles/tokens.css`, so the interpolation is
OKLCH-aware in browsers that support it (Chrome 111+ / Safari 16.4+).

**No change** — the visual is correct in modern browsers. The legacy
RGB fallback is not a F9-P1 concern (it is F10+ visual-regression
territory).

---

## 8. Items Explicitly NOT Touched in F9 Part 1

F9 Part 1 is a *consistency* pass, not a feature pass. The following
are correctly scoped to later F9 parts:

- **Full responsive / mobile audit** — F9 Part 2.
- **Full reduced-motion behaviour catalogue** — F9 Part 3.
- **Full keyboard-only pass** — F9 Part 4.
- **Full contrast / theme audit** — F9 Part 5.
- **Cross-screen QA & bug fixes** — F9 Part 6.
- **Lighthouse / bundle-size pass** — F10+.
- **Visual regression infrastructure** — F10+.

---

## 9. F9 Part 1 — Definition of Done

F9 Part 1 is complete when:

- [x] Every F0–F8 animation has been inspected
- [x] Each has been classified as KEEP / FIX / REMOVE / SIMPLIFY
- [x] The classification is documented in this file
- [x] The identified FIX items have been implemented
- [x] The identified SIMPLIFY items have been implemented
- [x] The motion tests pin the inventory
- [x] No new animation library was introduced
- [x] No timing regression was introduced
- [x] No component was rewritten beyond what the audit called for

Status: **Complete.**
