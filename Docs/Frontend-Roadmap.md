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

**Status (2026-08-27):** F8 functionally complete (Parts 1–5 shipped; Part 6 = final integration / scroll-choreography / QA, not yet started). F9 in progress — Part 1 (Motion Audit & Consistency) shipped; Parts 2–7 still pending.
* **Part 1** — Marketing foundation + Hero (lightweight SVG node visual; GSAP-driven 1.4s load choreography with reduced-motion bypass; sticky public nav; Spark gradient on the "connected" word; F2 carryover sections stay in place below the fold with stable section IDs so the header's nav anchors keep working; 19 new tests; marketing route 2.8 kB / 285 kB First Load JS — the F6 R3F graph bundle is NOT loaded on the marketing surface)
* **Part 2** — Problem → Solution → Hybrid Search (Problem: plain text, no imagery, no icon, no word-by-word reveal — the contrast with the hero is intentional; Solution: one-sentence scattered → connected transformation, struck-through "scattered" + Spark-gradient "connected"; Hybrid Search: reusable `<FeatureSection>` wrapper for the future 3 feature beats, CSS-only "two lists merge into one" animation that explains the actual Cortex retrieval architecture (Postgres full-text + pgvector → RRF → cross-encoder reranking), plays once per session, the final state is understandable without the animation; 28 new tests; route 4.85 kB / 287 kB First Load JS)
* **Part 3** — Knowledge Graph → Agents + MCP → Citations (Knowledge Graph: 9-node SVG graph with 5 categories + 1 Spark-highlighted relationship, plays once then settles; Agents + MCP: 6-stage vertical trace (Request → Agent → Plan → Retrieve → Tool [via MCP] → Result), the Tool stage is the Spark-accented "active" step, no specific vendor claims; Citations: answer + [1] marker + source card with "actually supports it" traceability message, fictional source name, no "AI you can trust" handwave; `<FeatureSection>` gets an `icon` prop (Spark-gradient treatment) reused by all 4 feature beats; marketing header nav updated to real F8 section IDs (`#product`, `#hybrid-search`, `#citations`); 39 new tests; route 6.39 kB / 289 kB First Load JS)
* **Part 4** — Live Interactive Demo (3 seeded demo entries, one per F8 feature beat; click a chip → auto-submit → streamed answer reveals in 2-4 word chunks at 45ms/chunk; superscript Ember citation chips with `aria-pressed` + `aria-label`; click a chip → right-side `Drawer` source panel with document title + location + blockquote excerpt; "View source" is a deliberately disabled affordance (no fake URL); real `<button>` citation chips (not `<span onClick>`); Spark Glow on the message bubble while streaming, settles flat on complete; animated caret dot (CSS keyframe, disabled under reduced motion); `useDemoStream` hook honours `runId` for race-condition safety + `prefers-reduced-motion` for the bypass; no backend dependency — pure client-side seeded data with no auth/tenant; 39 new tests; route 10.8 kB / 293 kB First Load JS)
* **Part 5** — Technical Credibility + Final CTA + Footer (Technical Credibility: a dense, quiet strip of five architectural facts — Postgres + pgvector, WebSocket streaming, MCP-native, Hybrid BM25 + vector, Reranked — in JetBrains Mono on a Cloud background, no animation, no Spark gradient, no vendor logos, regex-pinned against fake technology claims (no Kubernetes, Kafka, MongoDB, Pinecone, Elasticsearch, LangChain, Redis); Final CTA: a calmer version of the hero, single primary CTA → /register + a quiet secondary "I already have a workspace" text link → /login, one Section Display headline, one scroll-in fade-up; Footer: mono caption, Mist text, Cloud background, brand + 3 nav columns (Product / Resources / Legal) with real product / settings surfaces, deliberately empty Legal landmark (no fake Privacy / Terms), no fake GitHub link (Cortex repo is private), no fake public docs link, dynamic copyright year; hero secondary CTA swapped from "Sign in" → "See it work ↓" with `ArrowDown` icon targeting `#demo` (the lower-commitment action for skeptical visitors per the F8 P5 spec); hero section now exposes `id="product"` for the marketing nav's Product anchor; F2 carryover sections (features grid / "how it works" / mid-CTA / footer) fully removed and pinned as "must not reappear" in the integration test; page.tsx is now a thin composition layer (sections only) and Footer is a sibling of `<main>` so screen readers know the page is over; 42 new tests; route 11.2 kB / 294 kB First Load JS)

**F8 status:** Parts 1–5 shipped. F8 is functionally complete. **Part 6 (Full GSAP ScrollTrigger choreography + integration + QA pass) is the final F8 build step; it remains open but does not block the F9 audit pass starting.**

---

### F9 — Motion, Responsive & Accessibility Pass *(1–1.5 weeks)*

An audit-and-fill-gaps pass across everything built in F0–F8, not a from-scratch effort — much of this will already be partially in place.

- `UI-UX.md` §6's in-app motion rules applied consistently everywhere.
- Mobile breakpoints on every screen: sidebar → bottom nav or slide-over; 3D graph → 2D force-directed fallback below a defined device/performance threshold.
- `prefers-reduced-motion` verified everywhere; full keyboard-only pass; contrast checked in both themes per `UI-UX.md` §11.

**Status (2026-08-29):** F9 in progress. **Parts 1–5 shipped.** Parts 6–7 still pending.
* **Part 1** — Motion Audit & Consistency (the complete F0–F8 motion inventory with KEEP / FIX / REMOVE / SIMPLIFY classifications, documented in `Docs/frontend/f9-motion-audit.md` as the source of truth; the two-mode philosophy (bold marketing / calm app) is preserved end-to-end; the only FIX found was a visual bug in the marketing hero — the outer `<svg>` carried the `text-spark` class which set `color: transparent` and made the edge gradient's `currentColor` stops effectively invisible (the visual that should communicate "connected knowledge" was only showing the nodes); the only SIMPLIFY was consolidating three duplicate `usePrefersReducedMotion` hook implementations onto the canonical `useSyncExternalStore` version in `lib/motion/reduced-motion.ts` (marketing module + graph canvas now use the canonical hook); 5 new tests; 953/953 frontend tests pass; route / 11.2 kB / 294 kB First Load JS unchanged)
* **Part 2** — Responsive / Mobile Audit (the F0–F8 screen inventory audited at 320 / 375 / 390 / 768 / 1024 / 1280 / 1440 / 1920 viewports, documented in `Docs/frontend/f9-responsive-audit.md` as the source of truth; the two-mode responsive philosophy is preserved end-to-end; the only NEW capability is the **Knowledge Graph 3D → 2D fallback** — `useGraphCapability()` hook in `lib/graph/graph-capability.ts` combines three signals (viewport `< 768px`, `prefers-reduced-motion: reduce`, hardware concurrency `< 2`) and resolves to `"3d"` | `"2d"` | `"unknown"`; a new `GraphCanvas2D` component renders a pure-SVG radial layout (root at centre, first-degree neighbours on the inner ring, second-degree on the outer ring) with the same node/edge state semantics as the R3F canvas, touch-friendly hit areas (≥ 18px), real keyboard a11y (Enter/Space + `role="button"` + `aria-label`), and a "2D view" mode notice; the GraphExplorer wires the two canvases via the capability hook — the R3F canvas stays `next/dynamic` lazy-loaded (so only desktop pays the three + drei bundle cost), the 2D canvas is a direct import; the existing F1 `Table` primitive's `overflow-x-auto` already handles the documents-table mobile case (verified, no fix needed); the marketing header's `flex-wrap` pattern already handles the 3 nav anchors on mobile (verified, no fix needed); all other app surfaces (app sidebar, topbar, settings tabs, chat layout, document detail drawer, upload modal, agent trace, KG search) had mobile treatments from F0–F8 and were verified; 22 new tests; 975/975 frontend tests pass; route /app/graph 255 kB / 554 kB First Load JS (was 254 kB; +1 kB for the 2D SVG component, no R3F impact))
* **Part 3** — Reduced Motion & Interaction-State Audit (the complete F0–F8 reduced-motion inventory, documented in `Docs/frontend/f9-reduced-motion-audit.md` as the source of truth; the "decorative motion disappears, functionality is preserved" contract holds across every surface — the global CSS `*, *::before, *::after` block in `globals.css` flattens every animation + transition to 0.01ms, the Tailwind v4 motion token block in `motion.css` zeros out the duration tokens for defence-in-depth, the marketing site gates CSS keyframes via `motion-safe:` Tailwind variant, the GSAP hero timeline is bypassed by a `useEffect` early return when `usePrefersReducedMotion` is true, the R3F graph disables camera damping when reduced motion is on, the Radix-based modals + drawers + accordions respect the browser preference natively, the 2D graph fallback (F9 P2) is static by design; verified every motion-emitting surface — hero, hero visual, hero background, problem/solution sections, 4 feature sections, live demo streaming, caret blink, marketing header / footer / technical strip / final CTA, streaming message (Spark Glow + caret + Volt ping), conversation skeleton, agent trace, ingestion progress, connection indicator, knowledge graph explorer, theme view-transition, drawer, modal, spinner, skeleton primitive, settings tabs, document row hover, citation chip, onboarding progress; the streaming chat **continues to work** (state, not motion), the live demo **continues to work**, the ingestion progress **continues to update**, the Spark Glow **remains visible** (just flat, not breathing), the focus rings are colour-only and **never depend on motion**; 9 new behavioural tests in `tests/reduced-motion.test.tsx` pin the spec's §47 list (global CSS rule, motion token block, canonical hook, hero static state, demo streaming, 2D graph fallback, focus ring motion-independence, Spark Glow opacity preservation); 984/984 frontend tests pass; no production code changes — F0–F8 already satisfied the contract)
* **Part 4** — Keyboard & Focus-State Audit (the complete F0–F8 keyboard + focus inventory, documented in `Docs/frontend/f9-keyboard-audit.md` as the source of truth; the "DOM order = visual order = keyboard order" contract holds end-to-end; verified the **zero positive `tabIndex`** rule (a regex-pinned grep across the entire frontend returned no `tabIndex={1}` / `{2}` / etc.); verified the `outline-none` audit — every `outline-none` is paired 1:1 with a `focus-visible:ring-2 focus-visible:ring-ring` replacement (the Cortex Volt / Ring-token focus language is used consistently across **30+ components**); the skip-to-content link in the root layout (F0, Task 43) satisfies the F9 P4 §24 requirement; the keyboard handlers inventory is comprehensive — `MessageInput` (Enter / Shift+Enter), `DocumentRow` (Enter to open detail), `GraphCanvas2D` (Enter/Space to select), `GraphSearch` (Enter to search), `AppSidebar` (Ctrl/Cmd+B to collapse), `CitationPanel` / `Drawer` / `Modal` (Radix focus trap + Escape to close + focus restoration), `TooltipRoot` (focus on trigger surfaces the tooltip), `DropdownMenu` (Arrow keys + Enter + Escape), `Switch` (Space / Enter to toggle), `ConversationListItem` (Enter to open), `ConversationActionMenu` (Radix keyboard model), `InlineRename` (Enter to save, Escape to cancel), `DeleteConfirmation` (Escape to cancel, Enter to confirm), `RateLimitBanner` (the dismiss button is keyboard-accessible; the banner itself does not steal focus), `AuditLogTable` row (Enter to open detail), `DocumentDetailDrawer` (Reprocess + Delete are keyboard-reachable and visually separated), `GraphNodeDetail` (the source-document link is keyboard-reachable), `DemoQuestionChips` (Enter / Space to submit), `DemoCitation` (Enter to open source panel); 9 new behavioural tests in `tests/keyboard.test.tsx` pin the contract (skip-to-content link, real `<a>` elements, focus-visible ring, real `<button>` chips, no positive tabIndex, no div-role-button smell, 2D graph Enter/Space, marketing CTAs focus-visible); 993/993 frontend tests pass; no production code changes — F0–F8 already satisfied the contract)

* **Part 5** — Final QA: contrast + theme + design token discipline + Spark rationing (the final visual accessibility + integration QA gate, documented in `Docs/frontend/f9-final-qa.md` as the source of truth; the audit closed **three real F0–F8 gaps**: (1) **missing Mist token family** — the UI/UX spec calls Mist a palette colour (secondary text / caption / muted labels in both themes) but `tokens.css` had no `--mist-*` family, so a contributor reaching for `text-mist-500` would have found nothing; F9 P5 added `--mist-50` through `--mist-900` to `tokens.css` + the `--color-mist-*` mappings to the Tailwind v4 `@theme` block in `globals.css`, with OKLCH values tuned so `mist-500` matches the spec's dark-theme Mist (`#8B93A1`) and `mist-700` matches the spec's light-theme Mist (`#68707D`); (2) **`bg-spark` on the app-shell loading screen** — the route-level loading state in `app/loading.tsx` used a pulsing `bg-spark` brand mark, violating the UI/UX spec §19 rationing rule (Spark is rationed to the marketing surface + the actively-streaming Spark Glow + the 2D graph's active-path treatment); the loading mark is now a calm Volt accent (`bg-volt-500/40 ring-volt-500/30`); (3) **F5 P3 design debt** — `AgentTrace.tsx`, `AgentTraceStep.tsx`, `AgentRunHeader.tsx`, and the agent-run detail page used an ad-hoc parallel design system (`var(--border,#1f2937)`, `var(--surface,#0b1220)`, `var(--volt,#16a34a)`, `var(--warning,#f59e0b)` with hard-coded hex fallbacks) that predated the F0 token table; F9 P5 refactored all four to use the Cortex design tokens (`border-border`, `bg-card/60`, `text-volt-400`, `text-warning`, `text-muted-foreground`, `text-foreground`); the regression-net test `tests/final-qa.test.tsx` is a file-walk over `apps/web/` (skipping `node_modules` / `.next` / `tests`) that pins the F9 P5 contracts as a CI check — the design token table is the single source of truth (Cloud / Paper / Ink / Mist / Ember / Volt / Void / Slate all present), no arbitrary `rgb(` / `rgba(` / `hsl(` declarations outside the documented Spark Glow, no arbitrary `#hex` declarations outside the canvas + marketing visuals + PWA theme-color allow-list, the Spark gradient is contained to the marketing surface + the Spark Glow + the 2D graph's active-path treatment (zero usage in the rest of the app shell), zero raw `font-family:` declarations in the `components/` directory; a future contributor who quietly introduces an arbitrary `#hex`, a stray `font-family`, or a Spark usage in the app shell fails CI; 5 new tests; 998/998 frontend tests pass; route sizes unchanged; `pnpm typecheck` 0 errors; `pnpm lint` 475 errors (was 480 baseline; the F5 P3 refactor cleaned up 5 pre-existing issues))

**Next phase:** F9 Part 6 — Cross-Screen QA & Bug Fixes (the integration sweep across F0–F8 surfaces in both themes).

---

---

### F9 — Motion, Responsive & Accessibility Pass *(1–1.5 weeks)*

An audit-and-fill-gaps pass across everything built in F0–F8, not a from-scratch effort — much of this will already be partially in place.

- `UI-UX.md` §6's in-app motion rules applied consistently everywhere.
- Mobile breakpoints on every screen: sidebar → bottom nav or slide-over; 3D graph → 2D force-directed fallback below a defined device/performance threshold.
- `prefers-reduced-motion` verified everywhere; full keyboard-only pass; contrast checked in both themes per `UI-UX.md` §11.

**Definition of done:** a complete pass using dev-tools mobile emulation, reduced-motion emulation, and keyboard-only navigation across every single screen — no dead ends, no missing focus states.

**Status (2026-08-29):** F10 — Ongoing Hardening — **Parts 1–4 shipped** (source-level performance baseline + bundle optimization + 3D route isolation confirmation + visual-regression infrastructure + provider-agnostic analytics abstraction). Part 5 still pending.

* **Part 1** — Performance Baseline & Lighthouse (source-level audit only — the runtime Lighthouse cells are left TBD because they require a live browser session + Chrome + the `lighthouse` CLI, which are not available in this environment; the doc `Docs/frontend/f10-performance.md` provides the exact `npx lighthouse` commands for the local run; the source-level findings are sufficient to begin Part 2). Key findings: most authenticated app routes sit at ~290 kB First Load JS, marketing `/` 294 kB, `/app/graph` 554 kB (R3F + drei + three, already dynamic-imported), shared by all routes 100 kB; 122 `use client` directives (no unnecessary client components); 1 dynamic import (the R3F GraphCanvas, already isolated); GSAP lazy-loaded via `void import("gsap")`; **3D route already isolated** — the 5 R3F + drei + three chunks (~928 kB) are not in the main app shell, confirmed by the build manifest + a chunk-reference check on `main-4f86159c8fa94e70.js`; **dead dep identified: `framer-motion`** (listed in `package.json` but zero imports in source — the project uses GSAP for marketing + CSS transitions + Tailwind v4 motion tokens for in-app motion; safe to remove in F10-P2); **font weight over-provisioning** (Bricolage 6 weights loaded using 2, Space Grotesk 5 using 2, Mono 3 using 2 but 600 not loaded so mono + semibold falls back to CSS-synthesized bold); zero raster images (everything is inline SVG); zero third-party scripts; env config clean (all backend URLs through Zod-validated `packages/config/src/env.ts`); F10-P2's optimization queue is the dead `framer-motion` removal + the font weight trim + confirming the 3D isolation via measurement)
* **Part 2** — Bundle Optimization & 3D Route Isolation (the F10-P1 wins are now shipped: `framer-motion@11.11.17` removed from `apps/web/package.json` (was a dead dep, zero imports — `pnpm why framer-motion` now returns empty, lockfile dropped 24 lines); **font weight sets trimmed** in `apps/web/app/fonts.ts` — Bricolage Grotesque 6→2 (500/600), Space Grotesk 5→2 (500/600), JetBrains Mono 3→3 with 700 replaced by 600; **real bug fix: Mono 600 added** — any mono + `font-semibold` element (timestamps, API key masks, MCP tokens, code blocks) was previously falling back to CSS-synthesized bold; now renders the actual 600 weight; **3D route isolation re-verified** post-trim — all 6 main app routes (dashboard, documents, chat, settings/team, etc.) under 320 kB First Load JS, only `/app/graph` (554 kB) pulls the R3F + drei + three stack; **runtime impact measurement** — the F10-P2 changes affect unminified font assets, not the gzipped JS bundle; `next/font/google` already only emits `.woff2` files for weights actually referenced via CSS, so the `.woff2` byte total is unchanged at 178.5 kB; the win is **defensive + correctness**, not runtime savings: the trim makes the "weights actually used" contract explicit (a future `font-bold` will get a clean fallback rather than a surprise download) and the Mono 600 fix is a real correctness fix; **bundle budget established** in `Docs/frontend/f10-performance.md` §F10-Part 2 Results — marketing `< 300 kB`, app shell `< 320 kB`, graph route `< 600 kB`, middleware `< 40 kB`, shared `< 110 kB`; 998/998 frontend tests pass; `pnpm typecheck` 0 errors; `pnpm lint` 475 errors (unchanged); `pnpm build` success; F10-Part 2 Definition-of-Done completed except Lighthouse rerun (still requires local Chrome — the doc's §How to Run Lighthouse Locally provides the commands; F10-P2 changes don't materially move the gzipped JS numbers so the bundle budget is the more useful regression detector))
* **Part 3** — Visual Regression Testing with Playwright (the visual-regression infrastructure is in place: `e2e/visual/` directory with 4 spec files — `marketing.spec.ts` (4 tests), `auth.spec.ts` (5 tests), `app.spec.ts` (10 tests), `components.spec.ts` (2 tests) — for a total of 21 visual-regression test cases covering the marketing home + pricing + mobile, all 5 auth routes, every authenticated app surface (dashboard, documents, chat, knowledge graph 2D fallback, all 5 settings tabs), and the F1 component showcase; `e2e/visual/helpers.ts` provides `prepareForScreenshot` (flattens animations + waits for fonts + forces the correct theme), `signInAsTestUser` (stable test account), and `snapshot` (wraps `toHaveScreenshot` with stable naming + maxDiffPixelRatio overrides); `e2e/visual/README.md` documents the local workflow; `playwright.config.ts` extended with a fourth `visual-chromium` project that runs the visual suite with retries disabled (a flaky visual diff is always a real diff, not a flake); the master workflow doc `Docs/frontend/f10-visual-regression.md` captures the coverage matrix, the determinism contract, the browser-matrix rationale, the pixel-diff tolerance, and the Definition-of-Done; per the F10-Part 3 spec, **Playwright was chosen over Chromatic** because Playwright is already installed and the existing playwright.config.ts was already correct for visual regression — adding Chromatic would have introduced a second visual-testing toolchain with its own CI integration + Storybook requirement + per-seat pricing; the actual baseline PNGs are NOT in this commit — they're binary artifacts generated by the first local `pnpm test:e2e e2e/visual --update-snapshots` run against the seeded test environment; the seed account + fixtures live in the backend repo, not the frontend; Firefox + WebKit visual baselines + CI integration + per-component visual regression in every state + 3D canvas coverage are all deferred to future F10+ work)
* **Part 4** — Analytics & Conversion Tracking (the provider-agnostic abstraction is in place: `lib/analytics/provider/client.ts` defines the `AnalyticsClient` interface (track / identify / page / reset) with a restrictive `AnalyticsProperties` type (string | number | boolean only — no nested objects, no free-form strings, the type system is the gate against PII leaks); `lib/analytics/provider/noop.ts` is the default noop client (true no-op in production, `console.debug` in development); `lib/analytics/provider/index.ts` is the registry (`setAnalyticsClient` + `getAnalyticsClient` — a real provider boots once at app startup and binds via the registry, making the provider swappable without touching any call site); `lib/analytics/track.ts` is the public API with **22 documented events** as `const` strings (every event name is locked at the type level, the const-string pattern is a single-file lock against drift); `lib/analytics/index.ts` is the module's public entry point; `packages/config/src/env.ts` adds 3 new env vars: `NEXT_PUBLIC_ANALYTICS_PROVIDER` (default `"noop"`), `NEXT_PUBLIC_ANALYTICS_SITE_ID` (optional, provider-specific), `NEXT_PUBLIC_ANALYTICS_HOST` (optional, provider-specific); 9 call sites wired: marketing header (`marketing_cta_clicked` on Log in + Get started), hero (`landing_page_view` on mount + `marketing_cta_clicked` on both CTAs), final-CTA (`marketing_cta_clicked` on both CTAs), live demo (`live_demo_started` once per session + `live_demo_question_submitted` per question + `live_demo_completed` when the streamed answer resolves with `citation_count` + `demo_source_viewed` when a citation panel opens), register form (`signup_started` with `invite_token: true|false` from the URL query + `signup_completed` + `signup_failed` with a sanitised `reason` enum), login form (`login_started` + `login_completed` + `login_failed` with sanitised reason), workspace setup form (`workspace_created` on the success path), upload modal (`document_uploaded` on the file-upload success path with `source: "file"` + the MIME type); 15 new tests in `tests/lib/analytics.test.ts` pin the abstraction (noop behaviour, registry dispatch, event-name catalog lock, properties type restriction); **no specific analytics provider is selected** — the candidate table is in `Docs/frontend/analytics-events.md` §"Provider selection — open question" (Plausible, PostHog, Umami, Google Analytics 4, Segment + downstream); the abstraction makes the choice reversible — implementation is a 1-file change in `lib/analytics/provider/`; **privacy contract** explicitly forbids: document contents, chat messages, LLM prompts/responses, API keys, access/refresh tokens, MCP tokens, passwords, user email addresses, tenant IDs, conversation/document/run IDs, IP addresses, free-text user input; the `identify()` argument is a stable opaque UUID, never the user's email; 1013/1013 frontend tests pass; `pnpm typecheck` 0 errors; `pnpm lint` 471 errors / 12 warnings (was 475 baseline; net -4 because biome auto-fixed some pre-existing formatting issues in the touched files); `pnpm build` success; route sizes unchanged)

**Next phase:** F10 Part 5 — A/B Testing + Final Hardening (A/B testing is conditional on a real named experiment per the roadmap's "never add a technology because it's trendy" rule; the spec-valid outcome is "no experiment yet, reason documented"; F10-P5 will land the final dependency audit + env audit + sensitive-data audit + the A/B testing decision doc + the F10 final completion summary).

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
