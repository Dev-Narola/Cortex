/**
 * RateLimitBanner + rateLimitStore — F4 Part 4 (Task 97).
 */

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"

import { RateLimitBanner } from "@/components/feedback/RateLimitBanner"
import { rateLimitStore } from "@/hooks/system/rateLimitStore"

afterEach(() => {
  rateLimitStore.reset()
})

describe("RateLimitBanner", () => {
  it("renders nothing when no rate limit is set", () => {
    render(<RateLimitBanner />)
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("renders the message when the store has one", () => {
    rateLimitStore.set({ message: "Too many requests." })
    render(<RateLimitBanner />)
    expect(screen.getByRole("alert")).toBeInTheDocument()
    expect(screen.getByText(/too many requests/i)).toBeInTheDocument()
  })

  it("dismisses on X click", async () => {
    const user = userEvent.setup()
    rateLimitStore.set({ message: "Too many requests." })
    render(<RateLimitBanner />)
    await user.click(screen.getByRole("button", { name: /dismiss rate-limit/i }))
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("shows a live countdown when retryAfterMs is set", async () => {
    rateLimitStore.set({ message: "Slow down.", retryAfterMs: 3000 })
    render(<RateLimitBanner />)
    expect(screen.getByText(/try again in/i)).toBeInTheDocument()
    await waitFor(
      () => {
        // Eventually the countdown elapses
        // and the banner auto-dismisses.
        expect(screen.queryByRole("alert")).toBeNull()
      },
      { timeout: 5000 },
    )
  })
})
