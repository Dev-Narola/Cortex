/**
 * EmptyState / ErrorState / LoadingState — unit tests.
 *
 * F1 Part 3 (Task 30).
 */

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { EmptyState } from "./EmptyState"
import { ErrorState } from "./ErrorState"
import { LoadingState } from "./LoadingState"

describe("EmptyState", () => {
  it("renders the title + description", () => {
    render(<EmptyState title="No documents" description="Upload a PDF to get started." />)
    expect(screen.getByText("No documents")).toBeInTheDocument()
    expect(screen.getByText("Upload a PDF to get started.")).toBeInTheDocument()
  })

  it("renders the action button when actionLabel is set", async () => {
    const onAction = vi.fn()
    const user = userEvent.setup()
    render(<EmptyState title="No docs" actionLabel="Upload" onAction={onAction} />)
    const button = screen.getByRole("button", { name: "Upload" })
    await user.click(button)
    expect(onAction).toHaveBeenCalledOnce()
  })
})

describe("ErrorState", () => {
  it("renders the default title and the error code badge", () => {
    render(<ErrorState description="Couldn't reach the server." code="500" />)
    expect(screen.getByText("Something went wrong")).toBeInTheDocument()
    expect(screen.getByText("Couldn't reach the server.")).toBeInTheDocument()
    expect(screen.getByText("500")).toBeInTheDocument()
  })

  it("triggers the retry handler", async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()
    render(<ErrorState onRetry={onRetry} />)
    await user.click(screen.getByRole("button", { name: "Try again" }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it("uses the alert role for accessibility", () => {
    render(<ErrorState title="Boom" />)
    expect(screen.getByRole("alert")).toBeInTheDocument()
  })
})

describe("LoadingState", () => {
  it("renders the spinner mode with a title", () => {
    render(<LoadingState title="Loading documents" />)
    expect(screen.getByText("Loading documents")).toBeInTheDocument()
  })

  it("renders the skeleton mode with the children", () => {
    render(
      <LoadingState mode="skeleton">
        <div data-testid="skel">skeleton placeholder</div>
      </LoadingState>,
    )
    expect(screen.getByTestId("skel")).toBeInTheDocument()
  })
})
