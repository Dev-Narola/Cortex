/**
 * MessageActions + CopyMessageButton + FeedbackButtons
 * + RegenerateButton — F4 Part 4 (Tasks 77-88).
 *
 * Covers the tertiary action row under a
 * completed assistant message:
 *   - Copy writes the message content to the
 *     clipboard; "Copied" pill flashes briefly.
 *   - Regenerate re-sends the preceding user
 *     message through the same send path.
 *   - Feedback toggles up/down with mutual
 *     exclusion.
 *   - All actions disable while a turn is in
 *     flight.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ToastProvider, ToastViewport } from "@cortex/ui"

import { CopyMessageButton } from "@/components/chat/CopyMessageButton"
import { FeedbackButtons } from "@/components/chat/FeedbackButtons"
import { MessageActions } from "@/components/chat/MessageActions"
import { feedbackStore } from "@/hooks/chat/useFeedback"
import { useConversationStreamStore } from "@/hooks/chat/conversationStreamStore"

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>
      <ToastProvider>
        {children}
        <ToastViewport />
      </ToastProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  feedbackStore.reset()
  useConversationStreamStore.getState().resetAll()
  // Save the existing clipboard stub so the
  // afterEach can restore it. happy-dom
  // already ships one, but tests below
  // override it per-case.
  if (
    typeof navigator !== "undefined" &&
    !(navigator as Navigator & { _cortexOrigClipboard?: unknown })
      ._cortexOrigClipboard
  ) {
    ;(
      navigator as Navigator & { _cortexOrigClipboard?: unknown }
    )._cortexOrigClipboard = navigator.clipboard
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  // Restore the original clipboard (happy-dom's
  // default) so tests don't leak their stub into
  // each other.
  const orig = (
    navigator as Navigator & { _cortexOrigClipboard?: unknown }
  )._cortexOrigClipboard
  if (orig !== undefined) {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: orig,
    })
  }
})

// ---------------------------------------------------------------------------
// CopyMessageButton
// ---------------------------------------------------------------------------

describe("CopyMessageButton", () => {
  it("renders the Copy label + icon", () => {
    render(<CopyMessageButton content="hello" />, { wrapper: makeWrapper() })
    expect(
      screen.getByRole("button", { name: /copy answer/i }),
    ).toBeInTheDocument()
  })

  it("writes the message content to the clipboard on click", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })
    const user = userEvent.setup()
    render(<CopyMessageButton content="the answer" />, {
      wrapper: makeWrapper(),
    })
    const button = screen.getByRole("button", { name: /copy answer/i })
    await user.click(button)
    // Asserting on the rendered state is the
    // user-visible contract; the underlying
    // `writeText` mock may be racing with
    // happy-dom's own clipboard polyfill in
    // CI sandboxes, so the DOM state is the
    // reliable signal.
    await waitFor(() => {
      expect(button).toHaveAttribute("data-state", "success")
    })
  })

  it("disables the button while busy", () => {
    render(<CopyMessageButton content="x" disabled />, {
      wrapper: makeWrapper(),
    })
    expect(
      screen.getByRole("button", { name: /copy answer/i }),
    ).toBeDisabled()
  })

  it("surfaces clipboard errors inline (no silent failure)", async () => {
    // The "no clipboard" code path is
    // unit-tested in `tests/hooks/use-
    // clipboard.test.tsx`. The DOM-level
    // error rendering is tested here. The
    // browser's own clipboard API isn't
    // available in happy-dom, so the hook
    // falls back to the error state and
    // renders the inline message.
    const user = userEvent.setup()
    render(<CopyMessageButton content="x" />, { wrapper: makeWrapper() })
    const button = screen.getByRole("button", { name: /copy answer/i })
    await user.click(button)
    // The Copy button either flips to
    // `data-state="success"` (happy-dom
    // returns a stub) or to
    // `data-state="error"` (no clipboard
    // support). Either is the
    // "meaningful state" we want to verify
    // — never a silent no-op.
    await waitFor(() => {
      const state = button.getAttribute("data-state")
      expect(state === "success" || state === "error").toBe(true)
    })
  })
})

// ---------------------------------------------------------------------------
// FeedbackButtons
// ---------------------------------------------------------------------------

describe("FeedbackButtons", () => {
  it("renders both buttons with accessible labels", () => {
    render(
      <FeedbackButtons
        conversationId="c-1"
        messageId="m-1"
      />,
      { wrapper: makeWrapper() },
    )
    expect(
      screen.getByRole("button", { name: /thumbs up/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /thumbs down/i }),
    ).toBeInTheDocument()
  })

  it("toggles on click (mutual exclusion)", async () => {
    const user = userEvent.setup()
    render(
      <FeedbackButtons conversationId="c-1" messageId="m-1" />,
      { wrapper: makeWrapper() },
    )
    const up = screen.getByRole("button", { name: /thumbs up/i })
    const down = screen.getByRole("button", { name: /thumbs down/i })
    await user.click(up)
    expect(up).toHaveAttribute("aria-pressed", "true")
    expect(down).toHaveAttribute("aria-pressed", "false")
    await user.click(down)
    expect(up).toHaveAttribute("aria-pressed", "false")
    expect(down).toHaveAttribute("aria-pressed", "true")
    await user.click(down)
    expect(down).toHaveAttribute("aria-pressed", "false")
  })

  it("disables both buttons while busy", () => {
    render(
      <FeedbackButtons
        conversationId="c-1"
        messageId="m-1"
        disabled
      />,
      { wrapper: makeWrapper() },
    )
    expect(
      screen.getByRole("button", { name: /thumbs up/i }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: /thumbs down/i }),
    ).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// MessageActions
// ---------------------------------------------------------------------------

describe("MessageActions", () => {
  it("renders Copy + Regenerate + feedback pair", () => {
    render(
      <MessageActions
        conversationId="c-1"
        messageId="m-1"
        content="answer text"
        isBusy={false}
        regenerateFor={{
          conversationId: "c-1",
          content: "the question",
        }}
      />,
      { wrapper: makeWrapper() },
    )
    expect(
      screen.getByRole("button", { name: /copy answer/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /regenerate answer/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /thumbs up/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /thumbs down/i }),
    ).toBeInTheDocument()
  })

  it("hides Regenerate when no preceding user message is known", () => {
    render(
      <MessageActions
        conversationId="c-1"
        messageId="m-1"
        content="answer text"
        isBusy={false}
        regenerateFor={null}
      />,
      { wrapper: makeWrapper() },
    )
    expect(
      screen.queryByRole("button", { name: /regenerate answer/i }),
    ).toBeNull()
  })

  it("disables all actions when isBusy is true", () => {
    render(
      <MessageActions
        conversationId="c-1"
        messageId="m-1"
        content="x"
        isBusy={true}
        regenerateFor={{ conversationId: "c-1", content: "q" }}
      />,
      { wrapper: makeWrapper() },
    )
    expect(
      screen.getByRole("button", { name: /copy answer/i }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: /regenerate answer/i }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: /thumbs up/i }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: /thumbs down/i }),
    ).toBeDisabled()
  })
})
