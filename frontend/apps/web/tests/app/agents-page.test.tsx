/**
 * AgentsView — lists real agents, creates with the backend's payload shape,
 * and runs an agent, linking the result to the run inspector.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ToastProvider } from "@cortex/ui"

vi.mock("@/lib/auth/api-client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/auth/api-client")>("@/lib/auth/api-client")
  return { ...actual, getApiClient: vi.fn(), resetApiClient: vi.fn() }
})

import { AgentsView } from "@/app/(app)/app/agents/AgentsView"
import { getApiClient } from "@/lib/auth/api-client"

const agent = {
  id: "a1",
  name: "Support analyst",
  description: "Answers support questions",
  system_prompt: "Be precise.",
  model: "openai/gpt-oss-20b",
  status: "active",
  configuration: { max_iterations: 10, temperature: 0.2, max_tokens: 1024 },
  created_at: "2026-10-18T10:00:00Z",
  updated_at: "2026-10-18T10:00:00Z",
}

const client = { get: vi.fn(), post: vi.fn(), delete: vi.fn() }

function renderView() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <AgentsView />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

describe("AgentsView", () => {
  beforeEach(() => {
    vi.mocked(getApiClient).mockReturnValue(client as never)
    client.get.mockReset().mockResolvedValue({ items: [agent], total: 1 })
    client.post.mockReset()
  })

  it("lists agents from the API", async () => {
    renderView()
    expect(await screen.findByText("Support analyst")).toBeInTheDocument()
    expect(client.get).toHaveBeenCalledWith(
      "/api/v1/agents",
      expect.objectContaining({ query: { limit: 100 } }),
    )
  })

  it("shows the empty state when there are no agents", async () => {
    client.get.mockResolvedValue({ items: [], total: 0 })
    renderView()
    expect(await screen.findByText("No agents yet")).toBeInTheDocument()
  })

  it("creates an agent with the backend payload", async () => {
    const user = userEvent.setup()
    client.post.mockResolvedValue({ ...agent, id: "a2", name: "Researcher" })
    renderView()
    await screen.findByText("Support analyst")
    await user.click(screen.getByRole("button", { name: /new agent/i }))
    await user.type(screen.getByLabelText("Name"), "Researcher")
    await user.type(screen.getByLabelText(/instructions/i), "Cite every claim.")
    await user.click(screen.getByRole("button", { name: /create agent/i }))
    await waitFor(() =>
      expect(client.post).toHaveBeenCalledWith("/api/v1/agents", {
        name: "Researcher",
        description: "",
        system_prompt: "Cite every claim.",
        model: "openai/gpt-oss-20b",
      }),
    )
  })

  it("runs an agent and links to the run inspector", async () => {
    const user = userEvent.setup()
    client.post.mockResolvedValue({
      run_id: "r9",
      status: "completed",
      result: "Hybrid search fuses BM25 and vectors.",
      iterations: 2,
      tool_calls: 1,
      stop_reason: null,
    })
    renderView()
    await user.click(await screen.findByRole("button", { name: /^run$/i }))
    await user.type(screen.getByLabelText("Task"), "Explain hybrid search")
    await user.click(screen.getAllByRole("button", { name: /^run$/i }).at(-1)!)
    expect(await screen.findByText("Hybrid search fuses BM25 and vectors.")).toBeInTheDocument()
    expect(client.post).toHaveBeenCalledWith("/api/v1/agents/a1/execute", {
      message: "Explain hybrid search",
    })
    expect(screen.getByRole("link", { name: /inspect run/i })).toHaveAttribute(
      "href",
      "/app/agents/a1/runs/r9",
    )
  })
})
