/**
 * DashboardView — empty dashboard (F3 Part 1, Task 7).
 *
 * Verifies the spec's "Empty Dashboard" surface:
 *   - Renders the "Welcome to Cortex" hero heading.
 *   - Renders the workspace name from the auth store.
 *   - Renders the "Upload your first document" primary CTA.
 *   - Renders the Quick Actions row (Upload + Search +
 *     Create Agent, two of which are disabled "Soon").
 */

import { render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { DashboardView } from "@/app/(app)/app/dashboard/DashboardView"
import { useAuthStore } from "@/lib/auth/store"

describe("DashboardView (empty state — F3 Part 1)", () => {
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

  it("renders the primary 'Upload your first document' CTA", () => {
    useAuthStore.getState().setTenant({
      id: "t-1",
      slug: "acme",
      workspace: "Acme",
    })
    render(<DashboardView />)
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
    // The slug appears in the "{slug} is ready" heading
    // so the dashboard always reads naturally even
    // before the user has named their workspace.
    expect(screen.getByText(/acme is ready/i)).toBeInTheDocument()
  })

  it("renders the Quick Actions row with all three cards", () => {
    useAuthStore.getState().setTenant({
      id: "t-1",
      slug: "acme",
      workspace: "Acme",
    })
    render(<DashboardView />)
    expect(screen.getByText(/upload document/i)).toBeInTheDocument()
    expect(screen.getByText(/search knowledge/i)).toBeInTheDocument()
    expect(screen.getByText(/create agent/i)).toBeInTheDocument()
  })

  it("marks the 'Search Knowledge' and 'Create Agent' cards as Coming Soon", () => {
    useAuthStore.getState().setTenant({
      id: "t-1",
      slug: "acme",
      workspace: "Acme",
    })
    render(<DashboardView />)
    const soonBadges = screen.getAllByText(/^soon$/i)
    // Two "Soon" badges (one per disabled card).
    expect(soonBadges.length).toBe(2)
  })
})
