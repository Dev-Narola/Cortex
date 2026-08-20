# Frontend-Roadmap.md — Cortex

Companion to `UI-UX.md` (the design system — what everything should look, feel, and behave like), `database.md` (the API contract every phase below wires against), and `cortex-engineering-blueprint.md` (the backend's own version roadmap, §11, which this document mirrors in spirit). The backend is complete and live on EC2 — this document is the same kind of thing for the frontend: a version-by-version build sequence with enough detail that no phase becomes a guessing game, and no phase becomes a mess that bleeds into the next one.

**How to read this document:** `UI-UX.md` tells you *what* to build. This tells you *in what order*, *wired to which real endpoint*, and *how you'll know a phase is actually done* — the same job the blueprint's §11 does for the backend, just for the half of the system that doesn't exist yet.

---

## 1. Guiding Principles

Carried over directly from the backend blueprint's Engineering Rules, because the failure mode they guard against — building everything at once, nothing ever quite shipping — is exactly as real on the frontend as it was on the backend:

- **Component library before any real screen.** Every button, input, card, and modal gets built once in `components/ui/`, in both themes, before a single production screen uses one. If a screen needs a visual pattern that doesn't exist yet, the pattern gets added to the library first — never styled inline as a one-off.
- **Function before motion.** Every screen ships fully wired to the real backend before its animation pass. Motion is applied last, on top of something that already works — never a blocker to a working demo.
- **One state-management pattern, chosen once.** Server data (documents, conversations, usage) lives in TanStack Query, full stop. Local UI state (is the sidebar collapsed, is a modal open) lives in a small Zustand store. No component re-fetches into local `useState` and quietly forks from the source of truth.
- **One API client, typed against the real contract.** Every network call goes through `lib/api/`, one module per backend bounded context, matching `database.md`'s endpoint list. No inline `fetch()` calls inside components.
- **Theme is structural, not a preference.** Light vs. dark is decided once, in the route-group layout (`(marketing)` vs `(app)`), never as a per-component conditional or a user-facing toggle.
- **If a phase isn't demoable in under two minutes, it's scoped too big.** Same rule as the backend, unchanged, because it's just as true here.

---

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 14+ (App Router)** | Route groups map directly onto the light/dark split (`(marketing)` vs `(app)`); server components suit the mostly-authenticated, data-heavy app screens |
| Styling | **Tailwind CSS** + **shadcn/ui** primitives | Both palettes from `UI-UX.md` §2 live as Tailwind theme tokens; shadcn gives accessible unstyled primitives to skin rather than building from zero |
| Server state / data fetching | **TanStack Query** | Caching, refetch-on-focus, and loading/error states for every REST call, for free — this is what keeps server data from getting duplicated into scattered local state |
| Client/UI state | **Zustand** | Small, no boilerplate, exactly enough for sidebar-collapsed, active-modal, theme-transition-in-progress — deliberately not Redux, which is more ceremony than this app's client state needs |
| Realtime | Native **WebSocket**, wrapped in small custom hooks (`useConversationStream`, `useDocumentStatus`) | Matches the backend's raw FastAPI WebSocket endpoints directly — no extra library needed for a handful of channels |
| Forms & validation | **React Hook Form** + **Zod** | Zod schemas double as the client-side mirror of the backend's Pydantic validation — same shape of thinking on both sides of the wire |
| Animation (in-app) | **Framer Motion** | Restrained opacity/transform use per `UI-UX.md` §6 |
| Animation (marketing scroll story) | **GSAP ScrollTrigger** (or Framer Motion's `useScroll`/`useTransform` if that's enough) | The scroll-linked storytelling in `UI-UX.md` §6 needs real scroll-position control, not just viewport-triggered fades |
| 3D | **@react-three/fiber** + **@react-three/drei** | Powers the hero's node-network render and the Knowledge Graph Explorer — lazy-loaded only on the routes that use it |
| API types | **openapi-typescript** (or equivalent) generated from the backend's existing OpenAPI docs | The backend already produces accurate OpenAPI docs (per `Architecture.md`) — generating types from it means the frontend can never silently drift from the real contract |
| Icons | **lucide-react** | Matches `UI-UX.md` §5 |
| Fonts | **next/font**, self-hosted | Bricolage Grotesque, General Sans, JetBrains Mono — no runtime Google Fonts request |
| Testing | **Vitest** + **React Testing Library** (unit/component), **Playwright** (e2e) | e2e reserved for the handful of genuinely critical flows — auth, upload, chat — not every screen |

---

## 3. Current Folder Structure

The frontend lives in `frontend/` as a pnpm workspace. The Next.js app is one of three shared packages plus one deployable app; the actual screen tree mirrors the structure sketched in the original plan, with the workspace split added so that the design tokens, the API client, and the UI primitives are independently versioned and consumable.

```
frontend/                                    # pnpm workspace root
├── pnpm-workspace.yaml                       # registers apps/* and packages/* as workspaces
├── package.json                              # workspace-level devDeps (biome, vitest, etc.)
├── tsconfig.base.json                        # shared TS config inherited by every workspace
├── README.md                                 # workspace overview
│
├── apps/
│   └── web/                                  # the Next.js 15 + React 19 + TS 5.6 + Tailwind v4 app
│       ├── app/                              # App Router — every route lives here
│       │   ├── layout.tsx                    # root — fonts (next/font), global providers only
│       │   ├── page.tsx                      # public root — redirects into (marketing)
│       │   ├── globals.css                   # Tailwind v4 + OKLCH design tokens
│       │   ├── error.tsx                     # app-level error boundary
│       │   ├── not-found.tsx                 # 404
│       │   │
│       │   ├── (marketing)/                  # route group — light theme, public
│       │   │   ├── layout.tsx                # forces light theme
│       │   │   ├── page.tsx                  # landing page
│       │   │   └── pricing/page.tsx
│       │   │
│       │   ├── (auth)/                       # route group — light theme, public auth
│       │   │   ├── layout.tsx
│       │   │   └── login/page.tsx            # wired to POST /api/v1/auth/login
│       │   │
│       │   └── (app)/                        # route group — dark theme, auth-gated
│       │       ├── layout.tsx                # forces dark theme, sidebar + topbar shell
│       │       └── app/
│       │           ├── page.tsx              # dashboard
│       │           ├── documents/page.tsx
│       │           ├── conversations/page.tsx
│       │           ├── graph/page.tsx        # Knowledge Graph Explorer
│       │           ├── agents/page.tsx
│       │           ├── mcp/page.tsx
│       │           └── settings/page.tsx
│       │
│       ├── components/                       # app-specific components
│       │   ├── providers.tsx                 # ThemeProvider + TanStack Query + urql + ViewTransitions
│       │   ├── theme-toggle.tsx
│       │   ├── documents/upload-modal.tsx
│       │   ├── graph/force-graph.tsx
│       │   └── chat/streaming-message.tsx
│       │
│       ├── lib/                              # app-local hooks, stores, helpers
│       │   ├── auth/
│       │   │   ├── store.ts                  # Zustand: access token in sessionStorage
│       │   │   └── api-client.ts             # singleton ApiClient wired to the auth store
│       │   ├── socket/use-socket.ts          # native WebSocket w/ exponential backoff
│       │   ├── streaming/use-raf-stream.ts   # rAF token buffer (no re-render thrash)
│       │   ├── theme/view-transitions.tsx    # document.startViewTransition wrapper
│       │   └── motion/
│       │       ├── reduced-motion.ts
│       │       └── gsap-config.ts
│       │
│       ├── tests/                            # Vitest — unit
│       │   ├── setup.ts
│       │   ├── hooks/use-raf-stream.test.ts
│       │   └── lib/
│       │       ├── env.test.ts
│       │       ├── api-client.test.ts
│       │       └── login-schema.test.ts
│       │
│       ├── e2e/                              # Playwright — critical flows only
│       │   ├── auth.spec.ts
│       │   ├── chat-streaming.spec.ts
│       │   └── theme-transition.spec.ts
│       │
│       ├── middleware.ts                     # auth gate for (app)/* routes
│       ├── next.config.ts
│       ├── tsconfig.json                     # extends ../../tsconfig.base.json
│       ├── biome.json
│       ├── postcss.config.mjs                # Tailwind v4 postcss plugin
│       ├── vitest.config.ts
│       ├── playwright.config.ts
│       ├── .env.example                      # NEXT_PUBLIC_API_URL etc.
│       └── .env.local                        # gitignored — points at the deployed backend
│
└── packages/                                 # shared packages, versioned together via workspace:*
    │
    ├── config/                               # @cortex/config — env + endpoint registry
    │   └── src/
    │       ├── env.ts                        # Zod-validated public/server env
    │       ├── api.ts                        # typed endpoint registry
    │       └── index.ts
    │
    ├── ui/                                   # @cortex/ui — shadcn primitives + OKLCH tokens
    │   └── src/
    │       ├── styles/
    │       │   ├── tokens.css                # OKLCH light + dark palettes
    │       │   └── globals.css
    │       ├── primitives/                   # shadcn-style unstyled primitives
    │       │   ├── button.tsx
    │       │   ├── input.tsx
    │       │   ├── card.tsx
    │       │   ├── dialog.tsx
    │       │   ├── label.tsx
    │       │   ├── select.tsx
    │       │   ├── tabs.tsx
    │       │   ├── separator.tsx
    │       │   ├── badge.tsx
    │       │   ├── toast.tsx
    │       │   └── index.ts
    │       ├── utils/cn.ts                   # tailwind-merge wrapper
    │       └── index.ts
    │
    └── api-client/                           # @cortex/api-client — typed fetch wrapper
        └── src/
            ├── runtime.ts                    # ApiClient class: auth headers, 401 refresh, retries
            ├── types.ts                      # generated from backend /openapi.json
            └── index.ts
        scripts/
            └── generate.ts                   # codegen: fetch /openapi.json → types.ts
```

**Workspace roles:**

- `apps/web` — the only deployable. Pulls in `@cortex/config` (env), `@cortex/ui` (primitives), and `@cortex/api-client` (typed calls). The app owns its own auth store and api-client singleton because both depend on the browser context.
- `packages/config` — pure Zod schemas. Safe to import from server or client. No React.
- `packages/ui` — primitives only. Imports nothing from the app. Themable via CSS variables defined in `styles/tokens.css`.
- `packages/api-client` — runtime + generated types. The runtime is hand-written (auth, refresh, error mapping); the types come from the backend's OpenAPI via the codegen script under `scripts/`.

**What this changes vs. the original sketch:**

- The `lib/api/` per-context split (`auth.ts`, `documents.ts`, `search.ts`, …) became a single `ApiClient` + a generated types module. The number of distinct client files turned out to be a function of backend bounded contexts, not frontend ergonomics, so a runtime + types module pulls less weight.
- The Zustand `stores/` directory collapsed to a single `lib/auth/store.ts` because the only piece of cross-screen client state is the session — sidebar-collapsed, modal-open, etc. live as plain `useState` at the component level. (Re-evaluate if a second cross-screen state appears.)
- `components/marketing/` and `components/app/` collapsed into a single `components/` because the marketing pages are so thin that splitting them buys nothing right now.
- `styles/globals.css` lives in `app/` (Tailwind v4 + Next.js App Router convention) and the OKLCH tokens live in `packages/ui/src/styles/`. The app's `globals.css` imports the tokens file.

---

## 4. Engineering Conventions

A short list worth pinning somewhere visible, since these are exactly the decisions that get re-litigated screen-by-screen if they aren't settled once up front:

- Server data → TanStack Query, always. Local UI state → Zustand, always. If you're reaching for `useState` to hold something that also lives on the server, stop and use the query cache instead.
- New visual pattern → `components/ui/` first, real screen second. Never the other way around.
- Every fetch → through `lib/api/{context}.ts`. If a component is importing `fetch` directly, that's a signal something's wrong.
- Every new screen gets its loading state (skeleton, matching known shape) and its error state (stated fact + a retry action) before it's considered "done" — not just its happy path.
- Env vars: `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` point at the live EC2 backend; nothing else about the backend's location is ever hardcoded in a component.

---

## 5. Version Roadmap — F0 through F9+

*(Prefixed "F" for Frontend, to keep these versions distinct from the backend's already-completed V0–V9 track.)*

| Phase | Duration | Ships |
|---|---|---|
| **F0** | 3–5 days | Scaffold, both themes wired, live connection to the real backend |
| **F1** | 1–1.5 wks | Full component library, both themes |
| **F2** | 1 wk | Auth + onboarding, functional, bare-bones landing entry point |
| **F3** | 1.5–2 wks | Dashboard + Documents, live ingestion status |
| **F4** | 1.5–2 wks | Chat / Ask — streaming, cited answers |
| **F5** | 3–5 days | Conversation history + agent trace |
| **F6** | 1.5–2 wks | Knowledge Graph Explorer (3D) |
| **F7** | 1 wk | Settings — Team / API Keys / MCP / Usage / Audit |
| **F8** | 2 wks | Marketing site — full scroll-driven story |
| **F9** | 1–1.5 wks | Motion, responsive, and accessibility pass |
| **F10+** | ongoing | Performance, visual regression, analytics |

**Rough total to F9: ~13–17 weeks solo (about 3–4 months).** F10+ is open-ended, same as the backend's V9 — there's always another hardening pass worth doing, and that's fine.

---

### F0 — Frontend Foundations *(3–5 days)*

- Next.js + TypeScript scaffold; Tailwind configured with both palettes as design tokens (`UI-UX.md` §2); ESLint/Prettier; the folder structure above in place from day one.
- Fonts loading correctly in both themes (Bricolage Grotesque, General Sans, JetBrains Mono).
- `lib/api/` skeleton with a working call to the real backend's `GET /health` — proves the frontend can actually reach the live EC2 instance before anything else is built on top of it.
- Root layout + both route-group layouts (`(marketing)`, `(app)`) stubbed with nothing but the correct background color per theme.

**Definition of done:** a deployed page that successfully calls the real `/health` endpoint and renders correctly-colored light and dark route groups. Nothing else needs to work yet.

---

### F1 — Component Library *(1–1.5 weeks)*

- Every primitive from `UI-UX.md` §9 gets built in isolation, in both themes: Button (all variants × all states), Input, Select, Toggle, Card, Modal, Badge, Table, Toast, Tooltip, Citation chip, Skeleton.
- A single `/dev/components` route (or Storybook, if the overhead is worth it) to view every component and every state without needing real data, auth, or navigation.
- The one-primary-button-per-screen rule and the button placement rules (`UI-UX.md` §9) get encoded as component API constraints where practical (e.g., a `<ButtonGroup>` wrapper that enforces primary/secondary ordering), not just left as a doc convention someone has to remember.

**Definition of done:** every row in `UI-UX.md` §9's table exists as a typed component, visually verified in both light and dark context, before a single production screen is built.

---

### F2 — Auth & Onboarding *(1 week)*

- Sign Up, Log In, Workspace Setup screens, wired to the real `POST /auth/register`, `POST /auth/login`, `POST /tenants`.
- Session handling: JWT storage, silent refresh via `POST /auth/refresh`, redirect-to-login only on refresh failure (`UI-UX.md` Stage 10).
- Inline validation exactly as specified (email-taken, password-mismatch, strength hint).
- The light→dark theme transition on workspace-setup completion (`UI-UX.md` Stage 4) — build this now, while the auth flow is fresh context, rather than bolting it on later.
- A deliberately bare-bones landing page: headline, one CTA, no scroll story yet. Its only job right now is to be a real entry point into signup — the full marketing build is F8.

**Definition of done:** a brand-new visitor can land, sign up, name a workspace, watch the theme transition, and land on an empty dashboard — entirely against the real, deployed backend.

---

### F3 — App Shell, Dashboard, Documents *(1.5–2 weeks)*

- Sidebar + top bar (dark theme), auth-gated.
- Dashboard empty state; Documents list (populated) with the table spec from `UI-UX.md` §8; Upload modal (File / URL tabs); Document detail slide-over.
- Wired to `POST/GET /documents`, `GET /documents/{id}`, `DELETE /documents/{id}`, `POST /documents/{id}/reprocess`.
- Live status badge driven by the real ingestion WebSocket channel — `pending → parsing → chunking → embedding → indexed`, no polling.

**Definition of done:** upload a real file, watch it move through every status live without a page refresh, open its detail view, delete it, confirm it's actually gone server-side.

---

### F4 — Chat / Ask *(1.5–2 weeks)*

The core loop — arguably the single most important phase on this list, since it's the product's actual "aha moment" (`UI-UX.md` Stage 6).

- Conversation screen, message input, WebSocket token streaming, citation chips + side panel with source excerpt and "view full document" link.
- Wired to `POST /conversations`, `POST /conversations/{id}/messages`, and the `/ws/conversations/{id}` stream.
- Copy / Regenerate / thumbs-up-down controls, per `UI-UX.md` §8's Chat screen spec.

**Definition of done:** ask a real question about a real uploaded document and get back a streamed, correctly cited answer, with the citation genuinely clickable to the source excerpt.

---

### F5 — Conversation History + Agent Trace *(3–5 days)*

- Left-hand conversation list (`GET /conversations`), rename (inline edit) and delete.
- Agent trace stepper for multi-step questions, wired to `GET /agents/runs/{id}/tool-calls`, collapsed by default per `UI-UX.md` §9.

**Definition of done:** reopen a past conversation with full history intact; ask a question that requires multiple retrieval/tool steps and see a legible, real (not decorative) step-by-step trace.

---

### F6 — Knowledge Graph Explorer *(1.5–2 weeks)*

Isolated as its own phase deliberately — it's the heaviest single technical lift on this roadmap (3D rendering, a genuinely different interaction model from every other screen).

- `@react-three/fiber` scene: nodes, edges, search bar, node-detail side panel.
- Wired to `GET /kg/entities/{id}`, `GET /kg/entities/{id}/relations`, and `POST /kg/query` or `/graphql` depending on how the traversal query is shaped.
- Explicit performance-budget checkpoint before calling this phase done: frame rate on a mid-range laptop, not just on whatever machine it was built on — this is the one screen most likely to quietly blow a performance budget if that check gets skipped.

**Definition of done:** search for a real entity, see its connections highlight, click through to the source document it was extracted from — all at an acceptable frame rate on ordinary hardware.

**Status (2026-08-19):** F6 complete. Parts 1–4 all shipped:
* **Part 1** — 3D foundation (R3F + drei + three, code-split, Volt palette, Void background, full-bleed canvas)
* **Part 2** — real KG backend integration (TanStack Query hooks, 5 endpoints, source-chunk + canonical-id exposure)
* **Part 3** — exploration UX (active-path highlighting with Ember nodes + Spark-tinted edges, node detail panel, source-doc clickthrough via F3 drawer)
* **Part 4** — performance + hardening (shared `BufferGeometry` per scene, `React.memo` on every renderable, `frameloop="demand"`, 500-node render cap, ADR-0031 for the 3D dependency, 34 new tests, production build verified, no other route pulls the graph bundle)

Final notes: `Docs/frontend/knowledge-graph.md`. ADR: `Docs/adr/0031-react-three-fiber-for-knowledge-graph.md`.

---

### F7 — Settings *(1 week)*

- Team, API Keys, MCP, Usage & Billing, Audit Log tabs, per `UI-UX.md` §8's tab layout and consistent top-right primary-action placement.
- Wired to `/users/invite`, `/api-keys` (with the one-time-reveal pattern), `/tenants/me/usage`, `/audit-log`.

**Definition of done:** invite a teammate, generate an API key and confirm it's only ever shown in full once, and see the Usage tab reflect real `usage_events` rows.

**Status (2026-08-19):** F7 in progress. Parts 1–4 shipped; Part 5 (Audit Log) is the final part.
* **Part 1** — Settings shell + Team tab (route-driven 5-tab navigation, 28px / 1.25 line-height / 600 weight per UI spec, RBAC-aware Invite button, Zod-validated form, backend gap flagged in PR body)
* **Part 2** — API Keys (real backend integration, one-time-reveal UX, masked-prefix synthesis, RBAC-hidden Generate/Revoke for member/viewer, 36 new tests)
* **Part 3** — MCP (the 7 actual tools registered by the backend's `MCPToolRegistry`, "MCP token" = regular API key used as `X-API-Key`, endpoint URL composed from env config, spec's 4 stale tool names explicitly NOT in the list, 16 new tests)
* **Part 4** — Usage & Billing (3 backend endpoints wired, 4 stat cards, per-event-type breakdown, recent-events history; "Documents indexed" + "Rate-limit" cards OMITTED per the spec's no-fake-numbers rule; cost precision preserves `$0.0042` instead of rounding to `$0.00`; 30 new tests)

All shipped via direct local merges to `main` per the F6 P1/P2/P4 + F7 P1/P2/P3 precedent.

**Status (2026-08-19 — updated):** **F7 complete.** Part 5 (Audit Log) shipped.
* **Part 5** — Audit Log (the V4 observability surface at `GET /api/v1/audit-log`; keyset-paginated over `(created_at desc, id desc)`; 4 server-side filters (action / resource / date range / actor UUID); owner/admin only — the tab is HIDDEN for member/viewer, a friendly "no access" card covers the direct-URL 403 case; raw `ip_address` is NEVER rendered; `metadata` is filtered (no `password` / `token` / `api_key` / `secret` / `authorization` keys); read-only by construction — the service barrel exports no destructive helper, the panel never calls non-GET on the audit endpoint, the detail drawer has no edit/delete affordance; 39 new tests; route 5.67 kB / 304 kB First Load JS).

**F7 Definition of Done — final acceptance flow:**
```
1. Invite teammate
     ↓
2. Change/verify role
     ↓
3. Generate API key
     ↓
4. Confirm one-time reveal
     ↓
5. Revoke API key
     ↓
6. Generate/use MCP credentials
     ↓
7. Perform real Cortex activity
     ↓
8. Open Usage
     ↓
9. See real usage
     ↓
10. Open Audit Log
     ↓
11. See the actions recorded
     ↓
12. Verify tenant isolation
     ↓
13. Verify audit events are read-only
```

**Next phase:** F8 — Marketing Site: Full Build-Out.

---

### F8 — Marketing Site: Full Build-Out *(2 weeks — deliberately last)*

Replaces F2's placeholder landing page with the complete scroll-driven story from `UI-UX.md` §6–8: problem section, four animated feature blocks, the live interactive demo, the technical credibility strip, final CTA.

**Why this is last, not first:** everything before this phase is required for the product to *function*. This phase is required for the product to *convert a stranger*. Those are both real, but only one of them blocks having something demoable — building this last means the highest-animation-complexity, highest-scope-creep-risk piece of the whole roadmap can never hold the rest of the product hostage.

- GSAP ScrollTrigger (or Framer Motion scroll-linked) sequences per section; hero load choreography per `UI-UX.md` §6.
- The live demo box can run against real seeded example data rather than a live tenant, if that's simpler — it just needs to be an honest preview of the real chat screen's visual grammar, not a prettier fake.

**Definition of done:** full scroll-through matches the choreography in `UI-UX.md` §6; the live demo functions end to end; page-load sequence timing matches spec.

**Status (2026-08-19):** F8 in progress. Parts 1–2 shipped; Parts 3–6 are the remaining work.
* **Part 1** — Marketing foundation + Hero (lightweight SVG node visual; GSAP-driven 1.4s load choreography with reduced-motion bypass; sticky public nav; Spark gradient on the "connected" word; F2 carryover sections stay in place below the fold with stable section IDs so the header's nav anchors keep working; 19 new tests; marketing route 2.8 kB / 285 kB First Load JS — the F6 R3F graph bundle is NOT loaded on the marketing surface)
* **Part 2** — Problem → Solution → Hybrid Search (Problem: plain text, no imagery, no icon, no word-by-word reveal — the contrast with the hero is intentional; Solution: one-sentence scattered → connected transformation, struck-through "scattered" + Spark-gradient "connected"; Hybrid Search: reusable `<FeatureSection>` wrapper for the future 3 feature beats, CSS-only "two lists merge into one" animation that explains the actual Cortex retrieval architecture (Postgres full-text + pgvector → RRF → cross-encoder reranking), plays once per session, the final state is understandable without the animation; 28 new tests; route 4.85 kB / 287 kB First Load JS)

**Next phase:** F8 Part 3 — Knowledge Graph → Agents + MCP → Citations/Trust.

---

### F9 — Motion, Responsive & Accessibility Pass *(1–1.5 weeks)*

An audit-and-fill-gaps pass across everything built in F0–F8, not a from-scratch effort — much of this will already be partially in place.

- `UI-UX.md` §6's in-app motion rules applied consistently everywhere.
- Mobile breakpoints on every screen: sidebar → bottom nav or slide-over; 3D graph → 2D force-directed fallback below a defined device/performance threshold.
- `prefers-reduced-motion` verified everywhere; full keyboard-only pass; contrast checked in both themes per `UI-UX.md` §11.

**Definition of done:** a complete pass using dev-tools mobile emulation, reduced-motion emulation, and keyboard-only navigation across every single screen — no dead ends, no missing focus states.

---

### F10+ — Ongoing Hardening

- Performance: Lighthouse pass, bundle-size budget, code-splitting the 3D route specifically so it never taxes the rest of the app's load time.
- Visual regression testing (Playwright screenshot diffing or Chromatic) — worth adding once the component library is stable enough that regressions are actually worth catching automatically, not before.
- Analytics / conversion tracking on the marketing site.
- A/B testing infrastructure, if and only if there's a real, named question it would answer — same "never add a technology because it's trendy" rule the backend blueprint already committed to.

---

## 6. Cross-Version Risks

| Risk | Mitigation |
|---|---|
| Marketing polish gets built before the core product works | F8 is deliberately last; F2's landing page is deliberately minimal on purpose, not an oversight |
| Every screen invents its own button/card styling | F1 exists specifically to prevent this — `UI-UX.md` §9 is the single source of truth, no per-screen exceptions |
| The 3D graph explorer becomes an open-ended performance sink | Isolated as its own phase (F6) with an explicit, non-optional performance checkpoint |
| Server data gets duplicated into ad-hoc local state | TanStack Query is the only source of truth for server data from F0 onward — no exceptions written into later phases |
| The scroll-driven marketing animation becomes a rabbit hole | F8 has a concrete, bounded definition-of-done; anything beyond it is F10+ hardening, never a blocker to shipping |

---

## 7. How This Relates to the Other Docs

- **`UI-UX.md`** is the *what it should look and feel like* — colors, type, logo, motion rules, copy voice, every screen's layout and button placement.
- **This document** is the *in what order, wired to what, and how do I know when a phase is actually finished* — the build sequence that keeps the design system from turning into eleven inconsistent screens built in a rush.
- **`database.md`** is the endpoint-by-endpoint contract every phase above wires against — it's the ground truth for what each phase's "Wired to" line actually calls.
