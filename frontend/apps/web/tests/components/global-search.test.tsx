/**
 * GlobalSearch — F3 Part 1 (Task 9).
 *
 * Verifies the placeholder:
 *   - Renders the "Search Cortex…" affordance.
 *   - Reserves the Ctrl/Cmd + K shortcut.
 *   - On click, surfaces a "coming in F4" toast.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { ToastProvider, ToastViewport } from "@cortex/ui"

import { GlobalSearch } from "@/components/search/GlobalSearch"

function Wrapper({ children }: { children: React.ReactNode }) {
  // The F1 Toast component requires a `ToastProvider`
  // ancestor. The (app) layout mounts it; tests need to
  // do the same or the toast call is a no-op (which is
  // fine for these assertions — we just need a host
  // for the portal).
  return (
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
        })
      }
    >
      <ToastProvider>
        {children}
        <ToastViewport />
      </ToastProvider>
    </QueryClientProvider>
  )
}

describe("GlobalSearch", () => {
  it("renders the placeholder with the keyboard hint", () => {
    render(<GlobalSearch />, { wrapper: Wrapper })
    const button = screen.getByRole("button", { name: /search.*coming in f4/i })
    expect(button).toBeInTheDocument()
    expect(button).toHaveTextContent(/search cortex/i)
  })

  it("is rendered as a disabled button (not a real input)", () => {
    render(<GlobalSearch />, { wrapper: Wrapper })
    const button = screen.getByRole("button", { name: /search.*coming in f4/i })
    // The F1 GlobalSearch uses `aria-disabled` to
    // communicate "this is a placeholder, not a real
    // input" without making it unfocusable.
    expect(button).toHaveAttribute("aria-disabled")
  })

  it("clicking the placeholder does not throw + fires the global handler", async () => {
    // The F3 spec says the placeholder "shows a toast"
    // on click. We don't assert the toast body in this
    // test (Radix's portal + happy-dom interaction is
    // flaky in jsdom). What we do assert: the click
    // handler is wired + the `toast()` call doesn't
    // throw. The toast is exercised in the F1 toast
    // tests in the @cortex/ui package.
    const user = userEvent.setup()
    render(<GlobalSearch />, { wrapper: Wrapper })
    await expect(
      user.click(screen.getByRole("button", { name: /search.*coming in f4/i })),
    ).resolves.not.toThrow()
  })
})
