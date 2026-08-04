/**
 * Dialog — unit tests.
 *
 * F1 Part 3 (Task 22).
 *
 * **Scope.** Render the compound API; verify the close
 * button + size axis. The Radix focus-trap and Escape
 * dismissal are not tested here — happy-dom doesn't
 * implement `pointercapture` (Radix's pointerdown
 * handler relies on it) so we cover the keyboard path
 * in e2e tests (Playwright).
 */

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./index"

function ControlledDialog() {
  return (
    <Dialog>
      <DialogTrigger>Open</DialogTrigger>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Confirm action</DialogTitle>
          <DialogDescription>This is a confirmation dialog.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose>Cancel</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

describe("Dialog", () => {
  it("renders the trigger but not the content until opened", () => {
    render(<ControlledDialog />)
    expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("opens the content when the trigger is clicked", async () => {
    const user = userEvent.setup()
    render(<ControlledDialog />)
    await user.click(screen.getByRole("button", { name: "Open" }))
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText("Confirm action")).toBeInTheDocument()
  })

  it("applies the size axis via max-width utilities", async () => {
    const user = userEvent.setup()
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent size="sm" data-testid="content">
          <DialogTitle>Small</DialogTitle>
        </DialogContent>
      </Dialog>,
    )
    await user.click(screen.getByRole("button", { name: "Open" }))
    const content = screen.getByTestId("content")
    expect(content.className).toMatch(/max-w-sm/)
  })

  it("hides the close X button when showClose={false}", async () => {
    const user = userEvent.setup()
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent showClose={false} size="md">
          <DialogTitle>No Close Button</DialogTitle>
        </DialogContent>
      </Dialog>,
    )
    await user.click(screen.getByRole("button", { name: "Open" }))
    // The default close button has aria-label="Close"
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument()
  })

  it("Title and Description set the aria-labelledby / aria-describedby", async () => {
    const user = userEvent.setup()
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogTitle>My Title</DialogTitle>
          <DialogDescription>My Description</DialogDescription>
        </DialogContent>
      </Dialog>,
    )
    await user.click(screen.getByRole("button", { name: "Open" }))
    const dialog = screen.getByRole("dialog")
    const titleId = dialog.getAttribute("aria-labelledby")
    const descId = dialog.getAttribute("aria-describedby")
    expect(titleId).toBeTruthy()
    expect(descId).toBeTruthy()
    if (titleId) expect(document.getElementById(titleId)).toHaveTextContent("My Title")
    if (descId) expect(document.getElementById(descId)).toHaveTextContent("My Description")
  })
})
