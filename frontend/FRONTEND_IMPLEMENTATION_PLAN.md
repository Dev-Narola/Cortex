# Cortex frontend — implementation plan

Rule: change the shared layer first so every screen inherits it; touch screens only for layout or
missing functionality. No new animation library (CSS + existing helpers); one new dependency at most
(Markdown rendering). Finding IDs refer to FRONTEND_AUDIT.md.

1. **Foundation** — `tokens.css` (exact brief palette, dark + light, glass surfaces, radii, shadows,
   motion), `fonts.ts` (Inter / Space Grotesk / JetBrains Mono), codemod raw palette classes to
   semantic tokens (F1, F2). Card gets `glass` + `bento` variants instead of new components.
2. **Shell** — glass sidebar with Workspace / Management / System groups, real items only; topbar with
   command search + theme switch; theme no longer forced (F3).
3. **Screens** — bento dashboard on real data (F4); `/app/search` (F5); agents list/create/run (F6);
   team list + invite + role/deactivate + `/accept-invite` (F7, F8); URL ingestion + retry (F9, F10);
   chat Markdown + citations (F11); every other route re-themed and checked.
4. **Integration fixes** — logout (F12), honest password reset (F13), dead registry (F14).
5. **Motion** — page fade/slide (≤250 ms), staggered bento entrance, hover lift, all via tokens and
   disabled under `prefers-reduced-motion`.
6. **Verify** — lint (F15), typecheck, unit tests locally; `next dev` + browser screenshots at 375 /
   768 / 1280 / 1440 px against the live API; production build in CI.
