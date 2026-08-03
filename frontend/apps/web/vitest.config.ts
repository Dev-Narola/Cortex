/**
 * Vitest config — unit + component tests.
 *
 * **F0 scope (Task 32).** Per the spec:
 *   - `happy-dom` for the DOM (faster than jsdom, same API)
 *   - `setup.ts` registered so every test gets the matchers + mocks
 *   - path aliases mirror the TypeScript ones (`@/` + the
 *     workspace-symlinked `@cortex/*` packages)
 *   - coverage for `components/`, `lib/`, and the workspace `packages/`
 *
 * **Why we don't alias `@cortex/*` here.** pnpm symlinks each
 * workspace package into `node_modules/@cortex/*`, so the default
 * resolution finds them without an explicit override. Adding
 * one creates two competing resolutions and breaks the build.
 */

import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const r = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
    css: false,
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: [
        "components/**/*.{ts,tsx}",
        "lib/**/*.{ts,tsx}",
        "../../packages/ui/src/**/*.{ts,tsx}",
        "../../packages/config/src/**/*.{ts,tsx}",
        "../../packages/api-client/src/**/*.{ts,tsx}",
      ],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/*.spec.{ts,tsx}",
        "**/node_modules/**",
        "**/dist/**",
        "**/.next/**",
        "scripts/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@": r("./"),
    },
  },
})
