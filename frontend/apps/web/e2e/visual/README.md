# Visual Regression — `e2e/visual/`

This directory contains the F10-Part 3 visual-regression
test suite. It uses Playwright's built-in screenshot
comparison (`expect(page).toHaveScreenshot()`) against
the seeded test fixtures.

## Running locally

```bash
# 1. Make sure the dev server (or production server) is
#    running. The webServer config in playwright.config.ts
#    will start `pnpm dev` automatically if it's not.
#    Alternatively, run `pnpm --filter @cortex/web start`
#    in a separate terminal against a production build.

# 2. First run: write baselines
pnpm --filter @cortex/web exec playwright test e2e/visual --update-snapshots

# 3. Subsequent runs: compare against baselines
pnpm --filter @cortex/web exec playwright test e2e/visual

# 4. UI mode (live diff viewer)
pnpm --filter @cortex/web exec playwright test e2e/visual --ui
```

## File structure

```text
e2e/visual/
├── helpers.ts           # prepareForScreenshot + signInAsTestUser + snapshot
├── marketing.spec.ts    # marketing surface (light theme)
├── auth.spec.ts         # auth surface (light theme)
├── app.spec.ts          # authenticated app surface (dark theme)
├── components.spec.ts   # F1 component primitives showcase
└── README.md            # this file
```

After the first `--update-snapshots` run, Playwright
will create:

```text
e2e/visual/
├── marketing.spec.ts-snapshots/
│   ├── marketing-home-linux.png
│   ├── marketing-home-hero-linux.png
│   ├── marketing-pricing-linux.png
│   └── marketing-home-mobile-linux.png
├── auth.spec.ts-snapshots/
├── app.spec.ts-snapshots/
└── components.spec.ts-snapshots/
```

(Playwright appends the OS name to the snapshot filename
so the same suite can produce different baselines on
Linux vs macOS vs Windows CI runners. The `--update-snapshots`
flag regenerates the current platform's snapshot.)

## What is in scope for F10-Part 3

- Marketing: home, hero above-the-fold, pricing, home mobile
- Auth: login (default + error), register, forgot password, workspace setup
- App: dashboard, documents, chat, knowledge graph (2D fallback), settings (5 tabs)
- F1 primitives: showcase default + focus state

**Out of scope (intentionally):**

- 3D graph canvas (intrinsically non-pixel-stable; the
  2D fallback is the deterministic surface)
- LLM streaming responses (Task 14 forbids random LLM
  output from leaking into the baseline)
- API keys / MCP tokens / passwords (Task 20 — the
  visual-regression test account uses redacted fixtures
  only)

## Updating baselines

When you intentionally change a UI surface:

1. Make the UI change
2. Run `pnpm --filter @cortex/web exec playwright test e2e/visual/<surface>`
3. Review the diff in the HTML report (`playwright-report/index.html`)
4. If the diff is intentional, run `--update-snapshots`
5. Commit the updated snapshot PNGs alongside the source
   change (the snapshots are the visual contract)

## Determinism rules

**NEVER include in a visual baseline:**

- Real API keys, MCP tokens, passwords, or session JWTs
- Real document contents (use the seeded fixture docs)
- Real email addresses (use the seeded test accounts)
- Real tenant IDs (use the seeded test tenant)
- Random IDs (use the seeded fixture IDs)
- Current timestamps (use a frozen date in the test
  data — the seeded fixtures use a fixed date in 2024)
- Streaming tokens (the chat baseline uses a fully
  resolved assistant message, not a streaming one)
- 3D canvas frames (use the 2D fallback; the 3D canvas
  is intrinsically non-pixel-stable)

## Failure review

When a visual test fails:

1. Open `playwright-report/index.html` in a browser
2. Compare the expected (baseline) vs actual (current)
   side-by-side
3. If the diff is unintentional: investigate the source
   change that introduced it
4. If the diff is intentional (e.g. a design refresh):
   update the baseline with `--update-snapshots`

## CI integration

Add the visual suite to your CI pipeline after the
unit/integration tests pass:

```yaml
- name: Visual regression
  run: pnpm --filter @cortex/web exec playwright test e2e/visual
  env:
    PLAYWRIGHT_VISUAL_TEST_EMAIL: ${{ secrets.VISUAL_TEST_EMAIL }}
    PLAYWRIGHT_VISUAL_TEST_PASSWORD: ${{ secrets.VISUAL_TEST_PASSWORD }}
```

The CI run should **not** use `--update-snapshots` —
that flag is for local baseline maintenance only.
