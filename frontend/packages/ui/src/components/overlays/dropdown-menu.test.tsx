/**
 * DropdownMenu — unit tests.
 *
 * F1 Part 3 (Task 25).
 *
 * **Scope.** Render the trigger and confirm the menu
 * content is hidden until opened. The full keyboard nav
 * is covered by Radix + e2e.
 */

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { LogOut, Settings, User } from "lucide-react"
import { describe, expect, it, vi } from "vitest"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./DropdownMenu"

function UserMenuDemo({ onSelect }: { onSelect?: (value: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>Open</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          iconLeft={<User aria-hidden />}
          shortcut="⌘U"
          onSelect={() => onSelect?.("profile")}
        >
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem iconLeft={<Settings aria-hidden />}>Settings</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          tone="destructive"
          iconLeft={<LogOut aria-hidden />}
          onSelect={() => onSelect?.("logout")}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

describe("DropdownMenu", () => {
  it("renders the trigger but not the menu content", () => {
    render(<UserMenuDemo />)
    expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument()
    expect(screen.queryByText("Profile")).not.toBeInTheDocument()
  })

  it("opens the menu and shows the items with icons + shortcuts", async () => {
    const user = userEvent.setup()
    render(<UserMenuDemo />)
    await user.click(screen.getByRole("button", { name: "Open" }))
    // Item text becomes visible
    expect(screen.getByText("Profile")).toBeInTheDocument()
    expect(screen.getByText("Settings")).toBeInTheDocument()
    expect(screen.getByText("Sign out")).toBeInTheDocument()
    // Shortcut text
    expect(screen.getByText("⌘U")).toBeInTheDocument()
  })

  it("destructive tone applies the destructive class to the item", async () => {
    const user = userEvent.setup()
    render(<UserMenuDemo />)
    await user.click(screen.getByRole("button", { name: "Open" }))
    // The destructive class is on the DropdownMenuItem (the <li>), not
    // the inner <span> wrapping the text. Walk up to the item.
    const signOut = screen.getByText("Sign out").closest('[role="menuitem"]')
    expect(signOut).not.toBeNull()
    expect(signOut?.className ?? "").toMatch(/text-destructive/)
  })

  it("triggers the onSelect handler when an item is clicked", async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<UserMenuDemo onSelect={onSelect} />)
    await user.click(screen.getByRole("button", { name: "Open" }))
    await user.click(screen.getByText("Profile"))
    expect(onSelect).toHaveBeenCalledWith("profile")
  })
})
