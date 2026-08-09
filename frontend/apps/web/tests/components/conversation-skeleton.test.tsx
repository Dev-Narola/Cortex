/**
 * ConversationSkeleton — F4 Part 4 (Task 91).
 */

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ConversationSkeleton } from "@/components/chat/ConversationSkeleton"

describe("ConversationSkeleton", () => {
  it("renders the spec's role + accessible name", () => {
    render(<ConversationSkeleton pairCount={2} />)
    expect(screen.getByRole("status", { name: /loading conversation/i })).toBeInTheDocument()
  })

  it("renders the configured number of user/assistant pairs", () => {
    const { container } = render(<ConversationSkeleton pairCount={4} />)
    expect(container.querySelectorAll("[data-skeleton-pair]").length).toBe(4)
  })

  it("defaults to 3 pairs", () => {
    const { container } = render(<ConversationSkeleton />)
    expect(container.querySelectorAll("[data-skeleton-pair]").length).toBe(3)
  })
})
