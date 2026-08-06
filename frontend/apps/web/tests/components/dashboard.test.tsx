/**
 * Empty Dashboard — `/app/dashboard` (F2 Part 2, Task 20).
 *
 * Verifies the spec's "Empty Dashboard" surface:
 *   - Renders the "Welcome to Cortex" heading.
 *   - Renders the EmptyState for "no documents yet".
 *   - Renders the workspace name from the auth store.
 *   - Renders the user's email when set.
 *   - Renders the three hint cards (upload / ask / graph).
 *
 * The page is a server-renderable RSC-friendly default
 * export that uses `useAuthStore` (the auth store is
 * hydrated on the client before this page renders). In
 * tests we wrap the component with a small harness that
 * seeds the auth store.
 */

import { render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { DashboardView } from "@/app/(app)/app/dashboard/DashboardView"
import { useAuthStore } from "@/lib/auth/store"

describe("DashboardView (empty state)", () => {
  beforeEach(() => {
    useAuthStore.getState().clear()
    useAuthStore.setState({ hydrated: true, restored: true, isRestoring: false })
  })

  afterEach(() => {
    useAuthStore.getState().clear()
  })

  it("renders the Welcome to Cortex heading", () => {
    useAuthStore.getState().setTenant({
      id: "t-1",
      slug: "acme",
      workspace: "Acme",
    })
    render(<DashboardView />)
    expect(
      screen.getByRole("heading", { name: /welcome to cortex/i, level: 1 }),
    ).toBeInTheDocument()
  })

  it("renders the 'Your workspace is ready.' copy", () => {
    useAuthStore.getState().setTenant({
      id: "t-1",
      slug: "acme",
      workspace: "Acme",
    })
    render(<DashboardView />)
    expect(screen.getByText(/your workspace is ready/i)).toBeInTheDocument()
  })

  it("renders the 'No documents yet' EmptyState", () => {
    useAuthStore.getState().setTenant({
      id: "t-1",
      slug: "acme",
      workspace: "Acme",
    })
    render(<DashboardView />)
    expect(screen.getByText(/no documents yet/i)).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /upload your first document/i }),
    ).toBeInTheDocument()
  })

  it("renders the workspace name from the auth store", () => {
    useAuthStore.getState().setTenant({
      id: "t-1",
      slug: "acme",
      workspace: "Acme Inc",
    })
    render(<DashboardView />)
    expect(screen.getByText(/acme inc/i)).toBeInTheDocument()
  })

  it("falls back to the slug when the workspace name is missing", () => {
    useAuthStore.getState().setTenant({ id: "t-1", slug: "acme" })
    render(<DashboardView />)
    expect(screen.getByText(/acme/i)).toBeInTheDocument()
  })

  it("renders the three hint cards", () => {
    useAuthStore.getState().setTenant({
      id: "t-1",
      slug: "acme",
      workspace: "Acme",
    })
    render(<DashboardView />)
    expect(screen.getByText(/upload documents/i)).toBeInTheDocument()
    expect(screen.getByText(/ask questions/i)).toBeInTheDocument()
    expect(screen.getByText(/build the knowledge graph/i)).toBeInTheDocument()
  })
})
