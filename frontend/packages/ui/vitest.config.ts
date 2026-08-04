/**
 * Vitest config for the UI package.
 *
 * **F1 Part 2 scope.** The component test suite runs here so
 * the package is self-contained — `pnpm test:unit` from the
 * workspace root runs every package's tests via the
 * `test:unit` script.
 */

import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const r = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
    css: false,
    clearMocks: true,
    restoreMocks: true,
  },
  resolve: {
    alias: {
      "@": r("./src"),
    },
  },
})
