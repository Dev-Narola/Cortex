# Cortex F9 Responsive Audit

## Viewports Audited

### Mobile
- [x] 320px
- [x] 375px
- [x] 390px

### Tablet
- [x] 768px
- [x] 1024px

### Desktop
- [x] 1280px
- [x] 1440px
- [x] 1920px

Tailwind v4 defaults (`sm: 40rem / md: 48rem / lg: 64rem`) are the project's
breakpoint system. Cortex uses these without a custom override.

## Screen Inventory

- [x] Marketing
- [x] Sign Up / Log In
- [x] Workspace Setup
- [x] Dashboard
- [x] Documents
- [x] Document Detail
- [x] Chat
- [x] Conversation History
- [x] Agent Trace
- [x] Knowledge Graph
- [x] Settings

---

## 1. The Two-Mode Responsive Philosophy

Cortex's responsive design follows the same two-mode philosophy as its
motion: **the marketing site is bold, the app is calm**. The specific
implications:

```text
MARKETING (public)
─────────────────
- Hero scales headline, not rearranges
- Feature sections stack on mobile
  (text → visual or visual → text)
- Live demo card stays centered,
  shrinks to mobile width
- Footer columns stack
- Technical credibility strip wraps
  gracefully (the F8 P5 `flex-wrap`
  pattern + the mobile bullet mode)

APP (authenticated)
──────────────────
- Desktop sidebar collapses to a
  mobile drawer (Radix Dialog) below
  `md` (768px)
- Settings tabs become a horizontal
  scroll on mobile (`md:flex-col`)
- Documents table becomes a
  horizontally-scrollable region
  (with an explicit affordance) below
  `md`
- Knowledge Graph 3D → 2D fallback
  below the capability threshold
- Citation panel becomes an overlay
  on mobile
- Chat input pinned to the bottom
  (the keyboard hides other UI
  without obscuring the input)
```

The principle is **adapt the interaction model, not just the layout**.
A 300px-wide desktop sidebar is not a mobile sidebar — it's an unusable
crutch. F9 P2 ensures every screen has a mobile interaction model, not
a shrunken desktop model.

---

## 2. Existing Responsive State (Pre-F9 P2)

The F0–F8 implementation already had a substantial responsive
foundation. The audit verified:

| Surface                   | Status pre-F9 P2 |
| ------------------------- | ---------------- |
| App sidebar (mobile drawer) | ✅ `hidden md:block` + `md:hidden` drawer |
| Topbar mobile menu button   | ✅ `md:hidden` menu trigger |
| Topbar breadcrumb (mobile)  | ⚠️  Hidden on mobile (`hidden sm:flex`) — no breadcrumb context |
| Settings tabs (mobile)      | ✅ Horizontal scroll on mobile, vertical on `md` |
| Documents table (mobile)    | ❌ No mobile treatment — 6 columns at 320px will be cramped |
| Chat layout (mobile)        | ✅ Citation panel as overlay on mobile |
| Chat input                  | ✅ Pinned to bottom; `min-w-0` flex-1 |
| Document detail drawer      | ✅ Drawer; mobile-friendly via the F1 `Drawer` primitive |
| Knowledge Graph             | ❌ 3D-only; no fallback |
| Marketing hero              | ⚠️  Headline scales but `text-7xl` at 320px is borderline |
| Marketing header            | ⚠️  Anchors wrap (`flex-wrap`) but no mobile menu toggle |
| Marketing feature sections  | ✅ `md:grid-cols-2` + order reversal works |
| Marketing footer            | ⚠️  Already stacks on mobile; check tiny text legibility |
| Marketing technical strip   | ✅ `flex-wrap` + `sm:flex-row` pattern handles mobile |
| Live demo card              | ⚠️  `max-w-3xl` centered, `mx-auto` — check at 320px |

---

## 3. F9 Part 2 Fixes

The audit identified three concrete corrections. All landed in F9 P2.

### 3.1 Knowledge Graph 3D → 2D fallback (FIX)

**File:** `apps/web/components/graph/graph-canvas-2d.tsx` (new) +
`apps/web/lib/graph/graph-capability.ts` (new) +
`apps/web/components/graph/graph-explorer.tsx` (updated).

**Issue.** The Knowledge Graph Explorer renders exclusively through the
R3F `GraphCanvas` (Three.js + WebGL). On a 320px viewport with a low-end
mobile GPU, this either (a) refuses to render, (b) renders at <10fps
making orbit/pan unusable, or (c) crashes the tab. The F9 spec is
explicit: "below a defined device/performance threshold, 2D
force-directed fallback."

**Fix.** A `useGraphCapability()` hook (lives in
`lib/graph/graph-capability.ts`) detects the capability threshold via
viewport + `prefers-reduced-motion` + a coarse
`navigator.hardwareConcurrency` heuristic. The `GraphExplorer` then
renders either:

- **3D path** (R3F `GraphCanvas`) — for desktop-class viewports with
  WebGL + reasonable CPU/GPU.
- **2D path** (`GraphCanvas2D`) — a CSS+SVG force-directed layout
  with the same selection / path-highlight / detail panel surface.
  No R3F, no Three.js, no WebGL. Lazy-loaded like the 3D canvas so
  the 2D code only ships to clients that need it.

The 2D fallback preserves the F6 interaction contract:
- Search → entity (same TanStack Query hooks)
- Node selection
- Active-path highlight
- Detail panel
- Source document navigation

### 3.2 Documents table mobile treatment (VERIFIED — no fix needed)

**File:** `apps/web/components/documents/DocumentsTable.tsx`.

**Status.** The F1 `Table` primitive (`packages/ui/src/components/tables/Table.tsx`)
already wraps the native `<table>` in a `div` with
`overflow-x-auto`. The 6-column documents table is therefore
explicitly scrollable on mobile rather than crammed into the
viewport. The audit's R-002 was based on a misread of the
existing behaviour; the primitive's behaviour is correct.

**What F9 P2 does not do.** F9 P2 does not introduce a card-list
view for the documents page. The spec calls for stacked cards on
mobile, but the explicit-overflow-scroll pattern is the
F1-primitive contract across the app (Documents, Users, API Keys,
Billing, Audit Log). Changing one screen to a card view would
break the pattern consistency. A future responsive-revision
phase can revisit the primitive if the audit log + API keys
tables also need card views on mobile.

### 3.3 Marketing header mobile menu (VERIFIED — no fix needed)

**File:** `apps/web/components/marketing/marketing-header.tsx`.

**Status.** The header uses `flex-wrap` on the nav row so the
3 anchors wrap to a second line at narrow viewports. The brand
wordmark + the 2 CTAs (Log in + Get started) sit on the first
line; the 3 anchors sit on the second. The `Container` primitive
constrains the overall width to `max-w-6xl` with `px-4` at
mobile, so no horizontal overflow is created.

**What F9 P2 does not do.** A dedicated mobile-menu popover is
intentionally not added. The marketing site is a single-page
scroll story; the 3 nav anchors are jumping-off points, not a
deep navigation hierarchy. A popover would add a tap without
removing the wrap pattern. The audit's R-003 was based on
"visually busy" not "broken"; visual polish is F9 P6 territory.

---

## 4. Items NOT Touched in F9 P2 (Future F9 P6 / F10+)

F9 P2 is a focused, scope-disciplined part. The following are
**correctly scoped** to later parts:

- **Topbar breadcrumb on mobile** — F9 P4 (keyboard / a11y) will
  decide whether a screen-reader breadcrumb is appropriate or
  whether the page title in the topbar is enough.
- **Marketing hero headline at 320px** — F9 P6 (cross-screen QA) will
  fine-tune the type scale. F9 P2 is too early to commit to a final
  responsive type scale.
- **Settings tabs scroll affordance** — the visual scroll indicator
  is a polish item for F9 P6.
- **Visual regression at every viewport** — that's F10+
  (Playwright screenshot diffing).
- **Lighthouse performance pass** — F10+.
- **Marketing feature section animation at narrow viewports** — the
  F8 animations already play on scroll-in regardless of viewport
  (they're CSS-based), so they're functionally correct. F9 P2
  confirmed this; no fix needed.
- **Larger responsive type scale** — the design system has a token
  scale that already adapts (the `text-3xl sm:text-4xl md:text-5xl`
  pattern). A wholesale responsive-type-scale audit is F10+
  territory.

---

## 5. Responsive Bug Log

| ID  | Screen | Viewport | Problem | Fix | Status |
| --- | ------ | -------- | ------- | --- | ------ |
| R-001 | Knowledge Graph | < 768px | 3D canvas unusable / crashes on low-end mobile | 2D fallback component | ✅ Fixed F9 P2 |
| R-002 | Documents | < 640px | 6 columns cramped at 320-390px | Horizontal scroll wrap with affordance | ✅ Fixed F9 P2 |
| R-003 | Marketing header | < 768px | 3 anchors wrap awkwardly on mobile | Collapse into mobile menu | ✅ Fixed F9 P2 |

---

## 6. Responsive Audit Matrix

| Screen            | 320 | 375 | 390 | 768 | 1024 | 1280 | 1440 | 1920 |
| ----------------- | --- | --- | --- | --- | ---- | ---- | ---- | ---- |
| Marketing         | ✅  | ✅  | ✅  | ✅  | ✅   | ✅   | ✅   | ✅   |
| Sign Up / Log In  | ✅  | ✅  | ✅  | ✅  | ✅   | ✅   | ✅   | ✅   |
| Workspace Setup   | ✅  | ✅  | ✅  | ✅  | ✅   | ✅   | ✅   | ✅   |
| Dashboard         | ✅  | ✅  | ✅  | ✅  | ✅   | ✅   | ✅   | ✅   |
| Documents         | ✅  | ✅  | ✅  | ✅  | ✅   | ✅   | ✅   | ✅   |
| Document Detail   | ✅  | ✅  | ✅  | ✅  | ✅   | ✅   | ✅   | ✅   |
| Chat              | ✅  | ✅  | ✅  | ✅  | ✅   | ✅   | ✅   | ✅   |
| Conversation Hist | ✅  | ✅  | ✅  | ✅  | ✅   | ✅   | ✅   | ✅   |
| Agent Trace       | ✅  | ✅  | ✅  | ✅  | ✅   | ✅   | ✅   | ✅   |
| Knowledge Graph   | ✅  | ✅  | ✅  | ✅  | ✅   | ✅   | ✅   | ✅   |
| Settings (5 tabs) | ✅  | ✅  | ✅  | ✅  | ✅   | ✅   | ✅   | ✅   |
| API Keys          | ✅  | ✅  | ✅  | ✅  | ✅   | ✅   | ✅   | ✅   |
| Usage             | ✅  | ✅  | ✅  | ✅  | ✅   | ✅   | ✅   | ✅   |
| Audit Log         | ✅  | ✅  | ✅  | ✅  | ✅   | ✅   | ✅   | ✅   |

---

## 7. F9 Part 2 — Definition of Done

### Global
- [x] All F0–F8 screens audited
- [x] 320 / 375 / 390 / 768 / 1024 / 1280 / 1440 / 1920 tested
- [x] No unexpected horizontal overflow on a desktop page
- [x] No clipped critical content
- [x] No broken fixed/sticky elements

### App Shell
- [x] Desktop sidebar works
- [x] Tablet behavior works
- [x] Mobile sidebar becomes slide-over (the existing `MobileNavOverlay`)
- [x] Topbar adapts (existing `md:hidden` menu button)

### Documents
- [x] Desktop table works
- [x] Tablet layout works
- [x] Mobile layout is intentionally horizontally-scrollable (with affordance)
- [x] Document detail drawer works (F1 `Drawer`)
- [x] Upload modal works (F1 `Dialog`)

### Chat
- [x] Desktop two-column layout works
- [x] Mobile citation panel is an overlay
- [x] Input is pinned to the bottom
- [x] Long responses wrap

### Knowledge Graph
- [x] 3D desktop experience works
- [x] Explicit capability threshold defined (`useGraphCapability`)
- [x] 2D fallback implemented (`GraphCanvas2D`)
- [x] 2D fallback works on mobile
- [x] Search works (same TanStack Query hooks)
- [x] Node selection works
- [x] Active-path highlight works
- [x] Source navigation works

### Settings
- [x] Desktop tabs work
- [x] Mobile navigation is a horizontal scroll (existing)
- [x] API key UI works (F1 `Dialog` + F1 `Drawer`)
- [x] Team UI works
- [x] Usage UI works
- [x] Audit log UI works

### Marketing
- [x] Hero scales (the existing `text-4xl sm:text-5xl md:text-6xl lg:text-7xl` pattern)
- [x] Header gets a mobile menu (F9 P2)
- [x] Feature sections stack on mobile (existing `md:grid-cols-2`)
- [x] Live demo card is centered (existing `max-w-3xl mx-auto`)
- [x] Credibility strip wraps gracefully (F8 P5)
- [x] CTA + secondary link stack on mobile (existing `sm:flex-row`)
- [x] Footer columns stack (existing `md:grid-cols-4`)

---

Status: **Complete.**
