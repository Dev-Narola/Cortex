# Cortex F9 Reduced Motion Audit

## Status

- [x] Browser reduced-motion preference detected
- [x] Global CSS flattens all animations to near-zero
- [x] Tailwind v4 motion tokens drop to 0ms under reduced motion
- [x] `usePrefersReducedMotion` canonical hook (F9 P1)
- [x] Marketing motion gated (hero, features, demo, CTA)
- [x] App motion gated (chat streaming, ingestion, KG, theme)
- [x] Focus states remain visible (motion-independent)
- [x] Functional states remain visible (loading, errors, progress)
- [x] Functional interactions preserved (streaming, search, traversal, citation)

This document is the **source of truth** for every reduced-motion
decision in Cortex. F0–F8 already implemented a substantial portion
of the reduced-motion contract; F9 P3 documents, verifies, and
backfills the remaining surface.

---

## 1. The Reduced-Motion Philosophy

```text
NORMAL MOTION                REDUCED MOTION
────────────                 ──────────────
hero: 1.4s timeline         hero: static final state
hero idle: continuous        hero idle: static
hero parallax: cursor-tilt   hero parallax: none
feature sections: scroll-    feature sections: static
  triggered animation
chat streaming: chunks       chat streaming: chunks still
  with fade-in + Spark Glow    appear (no fade); Spark Glow
                                is flat (no breathing)
ingestion: cross-fade +       ingestion: status updates
  shimmer                       remain (no shimmer)
graph: slow node drift +     graph: static
  camera damping
theme: ~600ms cross-fade     theme: near-immediate
modal: opacity + small       modal: immediate
  transform
```

**Reduced motion does NOT mean reduced functionality.**

The audit pins the rule: the streaming, the search, the citation
panel, the graph traversal, the ingestion status, the rate-limit
banner, the focus rings, and the error states all continue to
work — they just lose the decorative motion layer.

---

## 2. Global Reduced-Motion Coverage

### 2.1 Global CSS rule (the catch-all)

**File:** `packages/ui/src/styles/globals.css` lines 211–220.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

This rule flattens **every CSS animation + transition in the
app** to its end-state instantly. It catches:

- `animate-pulse` (skeleton, connection indicator, streaming glow)
- `animate-ping` (Volt generating dot)
- `animate-spin` (button loaders, spinners)
- `transition-*` utilities (color, opacity, transform, all)
- The marketing keyframes (`hero-field-drift`, `hero-pulse`,
  `demo-caret-blink`)

The rule is intentionally **broad** — it would be a mistake to
selectively enable transitions because every transition that
ships in F0–F8 is decorative or transition-of-state (the latter
being a near-immediate state change under reduced motion, which
is fine).

### 2.2 Tailwind v4 motion tokens (defence-in-depth)

**File:** `packages/ui/src/styles/motion.css` lines 272–288.

```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-duration-fast: 0ms;
    --motion-duration-base: 0ms;
    --motion-duration-slow: 0ms;
    --motion-duration-stage: 0ms;
  }
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Even if a future component bypasses the global `*` selector
(e.g. a third-party style), the motion tokens flatten to `0ms`
and any duration bound to them drops to zero. The marketing
animations also use the `motion-safe:` Tailwind variant, which
explicitly opts in only when the preference is `no-preference`.

### 2.3 The canonical hook (F9 P1)

**File:** `apps/web/lib/motion/reduced-motion.ts` (and re-exported
by `apps/web/lib/marketing/animations.ts`).

```ts
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
```

Single source of truth. Uses `useSyncExternalStore` (React-
recommended for external stores) so components re-render on
media-query changes. Defensive against missing `matchMedia` and
old browsers.

---

## 3. Per-Surface Audit

The following table is the canonical behaviour catalogue. Every
motion-emitting surface in F0–F8 was inspected; the result is
documented here so a future contributor can verify the contract
without re-tracing the codebase.

### 3.1 Marketing (the bold surface)

| Surface | Motion | Reduced-motion behaviour | Functional? |
| --- | --- | --- | --- |
| `HeroSection` | 1.4s GSAP timeline | **Bypassed** via `useEffect` early return in `hero-section.tsx` | ✅ Static h1 / subhead / CTA on first paint |
| `HeroBackground` | Ambient fade via `data-hero-bg-element` | GSAP target; `gsap.timeline` skipped → final state | ✅ |
| `HeroVisual` (SVG) | 18s field drift + 3.4s edge pulse | Both gated by `motion-safe:animate-[…_infinite]` Tailwind variant | ✅ Static frame |
| `HeroVisual` cursor parallax | (Not implemented in F8 P1; F8 spec calls for optional) | n/a | n/a |
| `ProblemSection` | 600ms fade-up on scroll-in | `useInView` fires immediately on mount when `usePrefersReducedMotion` → `onEnter()` runs synchronously | ✅ |
| `SolutionSection` | Same | Same | ✅ |
| `HybridSearchSection` | 5-stage merge via `data-revealed` + `transition-delay` | `useInView` + `data-revealed=true` fires immediately | ✅ Final merged state |
| `KnowledgeGraphSection` | 9-node stagger | Same | ✅ |
| `AgentsMcpSection` | 6-stage vertical trace | Same | ✅ |
| `CitationsSection` | Answer → marker → source | Same | ✅ |
| `LiveDemoSection` / `DemoChat` | 45ms-per-chunk streaming | **Preserved** (this is interactive functionality, not decoration) | ✅ |
| `DemoMessage` caret | 1s `demo-caret-blink` | Gated by `motion-safe:animate-[demo-caret-blink_1s_ease-in-out_infinite]` | ✅ Static |
| `MarketingHeader` | Static | n/a | n/a |
| `MarketingFooter` | Static | n/a | n/a |
| `TechnicalCredibility` | Static by spec | n/a | n/a |
| `FinalCTA` | 600ms fade-up on scroll-in | `useInView` → immediate | ✅ |

### 3.2 Application (the calm surface)

| Surface | Motion | Reduced-motion behaviour | Functional? |
| --- | --- | --- | --- |
| `StreamingMessage` caret | 2s `animate-pulse` | Global CSS → 0.01ms | ✅ Chunks still appear (state, not motion) |
| `StreamingMessage` Volt ping | 2s `animate-ping` on the "Generating" dot | Global CSS → 0.01ms | ✅ |
| `StreamingMessage` Spark Glow | 2s `animate-pulse` on the radial-gradient backdrop | Global CSS → 0.01ms (and `transition-opacity duration-500` also flattens) | ✅ Glow is flat (still visible) |
| `ConversationSkeleton` | `animate-pulse` on each `Skeleton` primitive | Global CSS → 0.01ms | ✅ Skeletons remain visible (just non-shimmering) |
| `AgentTrace` skeleton row | `animate-pulse` | Global CSS → 0.01ms | ✅ |
| `AgentTrace` stepper expand/collapse | Radix Accordion (animated) | Radix respects `prefers-reduced-motion` natively | ✅ |
| `DocumentIngestionProgress` | `transition-[width] duration-300 ease-out` | Global CSS → 0.01ms | ✅ Progress still updates |
| `ConnectionIndicator` connecting | `animate-pulse` on the connecting dot | Global CSS → 0.01ms | ✅ |
| `GraphCanvas` (R3F) — orbit damping | `enableDamping={!reducedMotion}` | **Explicitly disabled** via the canonical `usePrefersReducedMotion` hook | ✅ Orbit / zoom / pan still work |
| `GraphCanvas2D` (2D fallback) | None by design (F9 P2) | n/a | ✅ |
| `ViewTransitions` (theme) | `document.startViewTransition` ~600ms | **Browser honours `prefers-reduced-motion` natively** (the `startViewTransition` API skips its own animation when the preference is `reduce`) | ✅ Theme still flips |
| `Drawer` (Radix) | `data-[state=*]:slide-in/out-from-*` | Global CSS flattens the slide | ✅ Panel still opens/closes |
| `Modal` (Radix Dialog) | Same as Drawer | Same | ✅ |
| `Spinner` (Lucide Loader2 + `animate-spin`) | Continuous rotation | Global CSS → 0.01ms | ✅ Static loader icon (still recognizable) |
| `Skeleton` primitive | `animate-pulse` | Global CSS → 0.01ms | ✅ |
| `Switch` (settings) | Radix Switch transition | Radix respects reduced motion | ✅ |
| `RateLimitBanner` | Mount/unmount transition | None (the banner is `sticky` and uses no decorative animation) | ✅ |
| `DocumentRow` hover | `transition-colors` | Global CSS → 0.01ms | ✅ Background change still visible (instant) |
| `ConversationListItem` hover | Same | Same | ✅ |
| `Search` / `CommandMenu` | Radix Dialog | Radix respects reduced motion | ✅ |
| `OnboardingProgressIndicator` | Static (per F2 design) | n/a | ✅ |
| `CitationChip` | `transition-colors` | Global CSS → 0.01ms | ✅ |
| `AgentTrace` (collapsible) | Radix Accordion | Radix respects reduced motion | ✅ |

---

## 4. Focus States (motion-independent)

Per the spec: "Reduced motion should never remove focus visibility."

The audit verified every interactive surface has a **colour /
border** focus state, not a motion-based one:

| Surface | Focus indicator | Motion? |
| --- | --- | --- |
| `Button` | `focus-visible:ring-2 focus-visible:ring-ring` | No (border) |
| `Input` | `focus-visible:ring-2 focus-visible:ring-ring` | No (border) |
| `Link` | `focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring` | No (border) |
| `Sidebar` nav items | `focus-visible:ring-2 focus-visible:ring-ring` | No |
| `Tabs` | `focus-visible:ring-2 focus-visible:ring-volt-500` | No (border) |
| Marketing CTA | `focus-visible:ring-2 focus-visible:ring-ring` | No |
| Marketing `ArrowDown` icon button | `focus-visible:ring-2 focus-visible:ring-ring` | No |
| `Switch` | Radix data-state `focus-visible:ring-2` | No |
| `Drawer` close button | `focus-visible:ring-2 focus-visible:ring-ring` | No |
| `CitationChip` | `focus-visible:ring-2 focus-visible:ring-ring` | No |
| `KnowledgeGraph` node (R3F) | Browser-default focus ring on the `<Canvas>` element | No (browser-native) |
| `KnowledgeGraph` 2D node | `tabIndex={0}` + `focus-visible:` styling (browser-default ring) | No |
| `DocumentRow` (keyboard selectable) | `focus-visible:ring-2 focus-visible:ring-ring` | No |

**Verdict.** No focus state in the app relies on motion to
communicate focus. The Volt ring + the Ring-token border are
colour-only; under reduced motion they remain visible. F9 P4
(keyboard / a11y) owns the comprehensive focus-state audit.

---

## 5. Functional States That Must NOT Be Suppressed

The spec is explicit: "Don't disable functional loading states."

| State | What it must remain | Implementation |
| --- | --- | --- |
| `Skeleton` primitives | Visible (the `bg-muted` is permanent; only the pulse is decorative) | ✅ `Skeleton` always renders the box; the `animate-pulse` is just decoration on top |
| `Spinner` (button loaders) | Visible icon | ✅ The Lucide `Loader2` is a real SVG, not an animation; the rotation is decoration |
| `StreamingMessage` chunks | Tokens still appear (the new chunk is rendered into the DOM, just without the fade transition) | ✅ The chunk append is state, not motion |
| `LiveDemo` streaming | Per-chunk word reveal (the `setTimeout` chain still runs) | ✅ The reveal is via state updates, not CSS transitions |
| Ingestion progress | Progress value still updates (`width: ${value}%`) | ✅ The width is bound to state; only the transition is decorative |
| Graph traversal | Traversed edges still get the active-path colour treatment | ✅ The state is the colour, the transition is decorative |
| Rate-limit banner | Still pinned to the top of the viewport | ✅ The banner is `sticky`; no animation needed |
| Error states | Still render with the same message + retry action | ✅ The error is a `<div>` with content; no motion |
| Focus states | Still ring-shaped and visible | ✅ Colour-only (see §4) |
| Streaming cursor caret | The dot is still visible (just doesn't blink) | ✅ The caret is a static `<span>`; only the `animate-pulse` is suppressed |
| `DocumentIngestionProgress` value text | Still reads "Parsing", "Chunking", etc. | ✅ The text is bound to state |

---

## 6. Reduced-Motion Behaviour Matrix

The summary table for the audit log.

| Area | Normal | Reduced | Functional? |
| --- | --- | --- | --- |
| Hero | 1.4s sequence | Static final state | ✅ |
| Hero idle | Continuous | Static | ✅ |
| Hero parallax | Cursor tilt | None (not implemented) | n/a |
| Hero mask-wipe | Word-by-word reveal | Static visible | ✅ |
| Hybrid Search | Animated merge | Static merged | ✅ |
| KG marketing | Draw animation | Static graph | ✅ |
| Agent marketing | Animated trace | Static trace | ✅ |
| Live demo | Streaming + caret blink | Streaming, no caret blink | ✅ |
| Chat | Chunk fade + Spark Glow | Immediate chunks, flat Glow | ✅ |
| Spark Glow | Breathing | Flat (still visible) | ✅ |
| Ingestion | Cross-fade | Near-zero | ✅ |
| Progress line | Width transition | Near-zero | ✅ |
| Graph explorer | Node drift | Static (F9 P2 2D fallback also static) | ✅ |
| Graph traversal | Edge pulse | Immediate path state | ✅ |
| Theme transition | ~600ms | Near-immediate (browser-native) | ✅ |
| Modal | Transition | Immediate | ✅ |
| Slide-over | Slide | Immediate | ✅ |
| Dropdown | Transition | Immediate | ✅ |
| Toast | Slide/fade | Immediate | ✅ |
| Hover (button) | Lift 2-3px | None (colour change preserved) | ✅ |
| Card hover | Lift | None (border / background preserved) | ✅ |
| Focus | Volt ring | Volt ring (no motion) | ✅ |
| Tooltip | Opacity transition | Immediate | ✅ |
| Citation chip | State transition | Immediate | ✅ |
| Agent trace | Expand transition | Immediate | ✅ |
| Settings tabs | Tab transition | Immediate content swap | ✅ |
| API key reveal | Security flow | Same (motion suppressed; one-time-reveal preserved) | ✅ |
| Error state | Same message + retry | Same (motion suppressed; content preserved) | ✅ |
| Rate-limit banner | Mount/unmount | Same (the banner is `sticky`; no animation) | ✅ |
| Session expiry | Silent refresh | Same (the auth flow has no animation) | ✅ |

---

## 7. Tests

### 7.1 Existing tests (F0–F9 P1 + P2)

- `tests/marketing/animations.test.tsx` — pins the marketing
  `useInView` + `MOTION` vocabulary + the marketing `usePrefersReducedMotion`
  re-export.
- `tests/lib/motion/reduced-motion.test.tsx` — pins the canonical
  hook (F9 P1 consolidation): default-false on the server, live
  subscription, safe fallback, and the fact that the marketing
  module's re-export is the same function reference.
- `tests/components/graph/graph-canvas-2d.test.tsx` — pins the 2D
  fallback (F9 P2); the component is static by design.
- All `animate-pulse` / `animate-spin` button-loader tests
  (`tests/settings/api-keys/generate-api-key-modal.test.tsx`,
  etc.) implicitly verify the loader still renders under reduced
  motion (the `Loader2` SVG is always present).

### 7.2 New behavioural test (F9 P3)

`tests/reduced-motion.test.tsx` — a single test file that
walks through the spec's §47 list and pins each surface's
reduced-motion contract:

- The global CSS rule flattens animations.
- The `usePrefersReducedMotion` hook reads + re-renders.
- The hero's GSAP timeline is bypassed.
- The live demo's streaming still works.
- The 2D graph fallback is static.
- The theme transition's `startViewTransition` is the only JS-driven
  large motion and is browser-honoured.

---

## 8. Items NOT Touched in F9 Part 3 (correctly scoped)

- **Full reduced-motion E2E** (Playwright with `reducedMotion:
  'reduce'`) → a future F9 P6 or F10+ visual-revision phase. The
  current unit tests pin the behavioural contract; the manual
  DevTools walkthrough is the human-verification step.
- **Comprehensive focus-state audit** (every interactive element
  with a focus ring) → F9 P4.
- **Reduced-motion keyframe suppression beyond CSS** (e.g. a JS
  animation library that doesn't honour the media query) → no such
  library is in use; the only JS-driven motion is GSAP in the hero,
  which is bypassed by `usePrefersReducedMotion`.
- **Reduced-motion analytics / metrics** → not a Cortex surface
  today; analytics is F10+.

---

## 9. F9 Part 3 — Definition of Done

> **With `prefers-reduced-motion: reduce` enabled, a user can
> complete the entire Cortex journey without losing information,
> functionality, navigation, or feedback — and all unnecessary
> motion has been removed or reduced to near-zero.**

This statement is true for F0–F8 today. The audit documents
where the contracts live. The new behavioural test in F9 P3
pins the spec's §47 list as a regression net.

Specifically the source requirement is satisfied:

```text
Hero            → static
Graph explorer  → static (2D fallback is also static)
Transitions     → near-zero
Demo            → still works
Streaming text  → still works
```

Status: **Complete.**
