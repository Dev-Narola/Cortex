/**
 * Vitest setup for the UI package.
 *
 * Same shape as the app's setup: jest-dom matchers, the
 * browser API polyfills (matchMedia, IntersectionObserver,
 * ResizeObserver), and the next/navigation stub.
 */

import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach, vi } from "vitest"

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

afterEach(() => {
  cleanup()
})
