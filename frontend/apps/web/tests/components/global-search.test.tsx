/**
 * GlobalSearch — the topbar trigger routes to /app/search (click or ⌘K),
 * and focuses the field instead when the Search page is already open.
 */

import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const pushMock = vi.fn()
let pathname = "/app/dashboard"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => pathname,
}))

import { GlobalSearch } from "@/components/search/GlobalSearch"

describe("GlobalSearch", () => {
  beforeEach(() => {
    pushMock.mockClear()
    pathname = "/app/dashboard"
  })

  it("is a real, enabled control with a keyboard hint", () => {
    render(<GlobalSearch />)
    const button = screen.getByRole("button", { name: /search knowledge/i })
    expect(button).not.toHaveAttribute("aria-disabled")
    expect(button).toHaveAttribute("aria-keyshortcuts", "Control+K Meta+K")
  })

  it("click opens the Search page", async () => {
    render(<GlobalSearch />)
    await userEvent.setup().click(screen.getByRole("button", { name: /search knowledge/i }))
    expect(pushMock).toHaveBeenCalledWith("/app/search")
  })

  it("Ctrl+K opens the Search page", () => {
    render(<GlobalSearch />)
    fireEvent.keyDown(window, { key: "k", ctrlKey: true })
    expect(pushMock).toHaveBeenCalledWith("/app/search")
  })

  it("on the Search page, ⌘K focuses the field instead of navigating", () => {
    pathname = "/app/search"
    render(
      <>
        <GlobalSearch />
        <input id="search-q" />
      </>,
    )
    fireEvent.keyDown(window, { key: "K", metaKey: true })
    expect(pushMock).not.toHaveBeenCalled()
    expect(document.activeElement?.id).toBe("search-q")
  })
})
