/**
 * ApiKeyReveal — F7 Part 2.
 *
 * Tests the one-time key contract (Task 43 —
 * the most important API-key test):
 *   - The raw key renders when the modal is
 *     open with a `created` payload.
 *   - The modal is closed (not visible) when no
 *     `created` is supplied (parent forgot to
 *     set it).
 *   - Done fires the `onClose` callback (the
 *     parent then clears its `rawKey` state).
 *   - The Copy button calls `navigator.clipboard
 *     .writeText` with the raw key.
 *   - Clipboard failure does NOT hide the key
 *     (Task 20 — the user can still select
 *     manually).
 *
 * The clipboard is mocked per-test.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiKeyReveal } from "@/components/settings/api-keys/api-key-reveal"
import type { ApiKeyCreated } from "@/services/api-keys"

const created: ApiKeyCreated = {
  id: "k-1",
  tenant_id: "t-1",
  name: "My Key",
  scopes: [],
  last_used_at: null,
  revoked_at: null,
  created_at: "2026-08-19T00:00:00Z",
  raw_key: "cx_live_TESTONLY_DO_NOT_LOG",
}

const writeTextMock = vi.fn()
const savedClipboard = (navigator as Navigator & { _cortexOrigClipboard?: unknown })
  ._cortexOrigClipboard

function installClipboard(behavior: "success" | "error") {
  if (behavior === "success") {
    writeTextMock.mockResolvedValueOnce(undefined)
  } else {
    writeTextMock.mockRejectedValueOnce(new Error("Permission denied"))
  }
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: writeTextMock },
  })
}

function restoreClipboard(): void {
  if (savedClipboard !== undefined) {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: savedClipboard,
    })
  } else {
    // Mocking the clipboard when no native
    // implementation exists: drop the property
    // so the useClipboard hook falls back to
    // its "not supported" path.
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    })
  }
}

beforeEach(() => {
  writeTextMock.mockReset()
  // Default: install a "success" clipboard.
  installClipboard("success")
})

afterEach(() => {
  vi.restoreAllMocks()
  restoreClipboard()
})

describe("ApiKeyReveal", () => {
  it("renders the raw key when open with a created payload", () => {
    render(<ApiKeyReveal open created={created} onClose={() => {}} />)
    expect(screen.getByTestId("api-key-reveal-modal")).toBeInTheDocument()
    const value = screen.getByTestId("api-key-reveal-value")
    expect(value).toHaveTextContent("cx_live_TESTONLY_DO_NOT_LOG")
  })

  it("does NOT render when open=true but created=null (parent forgot to set it)", () => {
    render(<ApiKeyReveal open created={null} onClose={() => {}} />)
    expect(screen.queryByTestId("api-key-reveal-modal")).not.toBeInTheDocument()
  })

  it("Done fires onClose so the parent can clear its raw-key state", () => {
    const onClose = vi.fn()
    render(<ApiKeyReveal open created={created} onClose={onClose} />)
    fireEvent.click(screen.getByTestId("api-key-reveal-done"))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("Copy writes the raw key to the clipboard (Task 44)", async () => {
    render(<ApiKeyReveal open created={created} onClose={() => {}} />)
    fireEvent.click(screen.getByTestId("api-key-reveal-copy"))
    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith("cx_live_TESTONLY_DO_NOT_LOG")
    })
  })

  it("clipboard failure does NOT hide the key (Task 20 — manual fallback)", async () => {
    installClipboard("error")
    render(<ApiKeyReveal open created={created} onClose={() => {}} />)
    fireEvent.click(screen.getByTestId("api-key-reveal-copy"))
    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalled()
    })
    // The raw key is still visible — the user
    // can select it manually.
    expect(screen.getByTestId("api-key-reveal-value")).toHaveTextContent(
      "cx_live_TESTONLY_DO_NOT_LOG",
    )
  })
})
