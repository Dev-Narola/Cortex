/**
 * Vitest setup — runs before every test.
 *
 * Stubs `next-themes`, framer-motion's reduced-motion listener,
 * and the platform APIs the auth / socket hooks touch. We do
 * not need the full DOM for unit tests; happy-dom is enough.
 */
import { vi } from "vitest";

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
  }));
}
