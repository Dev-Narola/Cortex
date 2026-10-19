# Cortex frontend — remaining tasks (2026-10-19)

Audit of the live build (https://cortex-red-three.vercel.app, commit 5807832): 13 app routes screenshotted at
1440 px in light and dark, plus a read of the shell, primitives and every screen's source. Items are evidence
from that audit or from earlier notes (handover, API gaps, the 2026-10-19 bug-fix session). Statuses below
are after this pass (commits 1f4421b, e3a9db9, 4a39f70 and the docs commit), verified on the deployed site.

Legend: `[x]` done and verified · `[~]` partially done · `[ ]` open · `[-]` blocked (reason given)

## A. Known leftovers from earlier passes

- [x] Knowledge-graph nodes in the old lime palette, labels overlapping. Root cause: the ring layout lay in
      the XZ plane, seen edge-on by the camera, so every node collapsed into one horizontal band. Now a
      sunflower disc facing the camera, nodes coloured by entity type, labels on hover above 24 nodes,
      camera fitted to the graph. The 2D fallback (phones / reduced motion) had near-invisible nodes and
      showed only a two-hop ring; now it shows every entity in type colours.
- [x] Chat citation `[1]` duplicated as a bare number under the answer: the row is now "Sources" with
      titled pills; inline markers are legible 10 px chips.
- [x] Visual review of agents, settings, auth, errors (screenshots below).

## B. Dead or fake controls

- [x] Documents search box filtered nothing → filters by name.
- [x] "Filter" and "Sort" placeholders → status pills with counts (All / Indexed / Processing / Failed) and a
      sort menu (newest, oldest, name). The list API has no search or sort, so the page loads the 200 most
      recent documents and says so when there are more.
- [x] "Chunks" column always "—" → removed (no such field on the list API).
- [x] Row action "↔" with a "(Part 3)" tooltip → chevron "Open details".

## C. Broken layout

- [x] Chat now fills the viewport height (one rounded workspace panel).
- [x] Chat on mobile: conversations drawer + New button in the header.
- [x] Documents status cell: badge for final states, stage bar only while in flight.
- [x] Team table clipped → overflow-safe, truncated emails, avatars; "Joined" from 1024 px.
- [x] Usage period card readable (compact text).
- [x] Settings: one `SectionHeader` pattern on every page.
- [x] Settings second vertical nav → segmented pill tab bar; content uses the full width.
- [x] Composer was always three lines (primitive overrode `rows`) → one line, grows to eight.
- [x] Pricing CTA: dark text on a near-black button in light mode (unreadable) → primary pill.
- [x] Pricing had no header/footer (dead end) → marketing header + footer.
- [x] Onboarding showed a placeholder gradient "illustration" → the real three setup steps.

## D. Design system: orange-first identity

- [x] Tokens: warm-paper light, warm-charcoal dark, orange scale, sparing accents, semantic colours with
      contrast-checked text variants (documented in `FRONTEND_DESIGN_SYSTEM.md`).
- [x] Geometry 8 / 10 / 14 / 20 / 24 px + pills; soft warm shadows.
- [x] Manrope display, Inter UI, JetBrains Mono.
- [x] Lightning-bolt mark: logo, favicon, manifest, theme-color, chat voice (`BoltMark`), marketing header.
- [x] Glass only on floating chrome (top bar, graph overlays, status pills); content cards opaque.
- [x] Theme: Light / Dark / System menu, system default, persisted, no flash (verified: reload + navigation).

## E. Screens

- [x] App shell · [x] Dashboard (bento, Ask bar starts a real conversation) · [x] Documents · [x] Search ·
      [x] Chat · [x] Agents · [~] Agent run (restyled, not screenshotted: no runs exist in the review
      workspace) · [x] Knowledge graph · [x] Settings (team, API keys, MCP, usage, audit log) ·
      [x] Login · [~] Register / forgot / reset / accept invite / workspace setup (share `AuthLayout` /
      the restyled onboarding layout; register screenshotted, the others not) · [x] Landing · [x] Pricing ·
      [x] 404 · [~] error boundaries and loading states (restyled, not triggered in a browser).

## F. Verification

- [x] Type-check (`tsc --noEmit`), Biome: clean.
- [x] Unit tests: web 1054 + UI 136 passing (contracts that pinned the old palette were updated).
- [x] Production build: Vercel READY and the Frontend CI workflow (build + tests) green for every commit.
- [x] Live screenshots: 12 app routes at 1440 (light + dark), 8 at 375 and 768 (light + dark), public pages
      at 1440 and 375 (light + dark); no horizontal overflow, no console errors, no 5xx.
- [ ] 430 / 1024 / 1920 widths not captured separately (375, 768 and 1440 were).

## Out of scope / blocked (backend)

- [-] G6 email delivery for invites and resets: needs an SES/SMTP provider (UI shows copyable links).
- [-] G7 `agent.model` is stored but not used for routing (UI labels the field honestly).
- [-] Document list has no name search, sort or chunk count on the API; the UI filters the loaded page
      client-side and says so when not every document is loaded.
- [ ] Infra (not changed, your call): a frontend-only push also runs backend CI → Deploy, which rebuilds and
      restarts the API (~1–2 min). A `paths-ignore: ["frontend/**"]` on `ci.yml`'s push trigger would stop it.
