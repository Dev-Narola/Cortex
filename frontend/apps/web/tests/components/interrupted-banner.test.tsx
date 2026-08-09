/**
 * InterruptedBanner — F4 Part 4 (Tasks 94-95).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { InterruptedBanner } from "@/components/chat/InterruptedBanner"
import { useConversationStreamStore } from "@/hooks/chat/conversationStreamStore"

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  useConversationStreamStore.getState().resetAll()
})

describe("InterruptedBanner", () => {
  it("renders the interrupted copy + a Retry button", () => {
    render(
      <InterruptedBanner
        conversationId="c-1"
        content="the question"
      />,
      { wrapper: makeWrapper() },
    )
    expect(screen.getByText(/response interrupted/i)).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /retry the interrupted response/i }),
    ).toBeInTheDocument()
  })
})
