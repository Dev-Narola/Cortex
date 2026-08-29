/**
 * Vitest setup — runs before every test.
 *
 * **F0 scope (Task 31).** Per the spec, future tests should
 * never duplicate setup logic. Anything that touches the DOM,
 * network, or browser globals gets its mock/stub here, not in
 * the individual test file.
 *
 * What this file does:
 *   1. Extends `expect` with `@testing-library/jest-dom` matchers
 *      (`toBeInTheDocument`, `toHaveTextContent`, etc.).
 *   2. Stubs `matchMedia` (not implemented in happy-dom).
 *   3. Stubs `IntersectionObserver` / `ResizeObserver` (not in
 *      happy-dom, used by scroll-spy hooks + future components).
 *   4. Stubs `crypto.randomUUID` for the rare Node test env that
 *      doesn't expose it.
 *   5. Auto-cleans up between tests so DOM state doesn't leak.
 */

import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach, vi } from "vitest"

// matchMedia is not implemented in happy-dom by default.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

// IntersectionObserver / ResizeObserver are not in happy-dom.
if (typeof globalThis !== "undefined") {
  if (!("IntersectionObserver" in globalThis)) {
    ;(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = vi
      .fn()
      .mockImplementation(() => ({
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
        takeRecords: vi.fn(() => []),
      }))
  }
  if (!("ResizeObserver" in globalThis)) {
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = vi
      .fn()
      .mockImplementation(() => ({
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      }))
  }
}

// next/router stub — components that use useRouter() in tests
// get a no-op router instead of a hard crash.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
  useParams: () => ({}),
}))

// Auto-cleanup React Testing Library state between tests.
afterEach(() => {
  cleanup()
})
