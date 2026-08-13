/**
 * useIngestionStatus — F3 Part 4 (Task 49).
 *
 * Verifies the end-to-end flow from a WebSocket
 * event to a TanStack Query cache patch:
 *
 *   1. The hook mounts + opens a connection
 *      (the shared singleton is refcounted).
 *   2. A synthetic event arrives on the socket.
 *   3. The matching document in BOTH the list
 *      cache + the detail cache is patched.
 *   4. A stale event is dropped (no patch).
 *   5. Multiple documents update independently.
 *   6. Cleanup: the last consumer unmounting
 *      tears down the socket (Task 46).
 *
 * The test stubs the global `WebSocket` (same
 * pattern as the client + service tests) so the
 * hook can drive the events end-to-end.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/lib/auth/store"
import { useIngestionStatus } from "@/hooks/documents/useIngestionStatus"
import type { Document } from "@/services/documents"

class FakeSocket {
  static instances: FakeSocket[] = []
  static reset() {
    FakeSocket.instances = []
  }
  url: string
  closed = false
  private listeners = new Map<string, Array<(e: unknown) => void>>()
  constructor(url: string) {
    this.url = url
    FakeSocket.instances.push(this)
  }
  addEventListener(name: string, cb: (e: unknown) => void): void {
    if (!this.listeners.has(name)) this.listeners.set(name, [])
    this.listeners.get(name)!.push(cb)
  }
  removeEventListener(): void {}
  send(): void {}
  close(): void {
    this.closed = true
    this.dispatch("close", { code: 1000 })
  }
  dispatch(name: string, payload: unknown): void {
    for (const cb of this.listeners.get(name) ?? []) cb(payload)
  }
}

beforeEach(() => {
  FakeSocket.reset()
  vi.stubGlobal(
    "WebSocket",
    vi.fn((url: string) => new FakeSocket(url)) as unknown as typeof WebSocket,
  )
  // Reset the auth store to a logged-in state.
  useAuthStore.setState({
    accessToken: "tok-1",
    hydrated: true,
    restored: true,
    isRestoring: false,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  useAuthStore.getState().clear()
})

function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

function makeDoc(overrides: Partial<Document> = {}): Document {
  return {
    id: "d-1",
    title: "Quarterly Plan.pdf",
    mime_type: "application/pdf",
    status: "pending",
    created_at: "2025-01-01T00:00:00.000Z",
    ...overrides,
  }
}

function dispatchEvent(
  sock: FakeSocket,
  payload: { type: string; document_id: string; status?: string; timestamp?: number },
): void {
  sock.dispatch("message", { data: JSON.stringify(payload) })
}

describe("useIngestionStatus (Task 49)", () => {
  it("opens a connection on first mount and exposes the state", async () => {
    const qc = new QueryClient()
    const { result, unmount } = renderHook(() => useIngestionStatus(), {
      wrapper: makeWrapper(qc),
    })

    expect(FakeSocket.instances).toHaveLength(1)
    expect(FakeSocket.instances[0]!.url).toContain("/ws/ingestion")
    expect(FakeSocket.instances[0]!.url).toContain("token=tok-1")

    // Drive the open event.
    act(() => {
      FakeSocket.instances[0]!.dispatch("open", {})
    })
    await waitFor(() => expect(result.current.connectionState).toBe("open"))
    unmount()
  })

  it("patches the list cache when an event arrives", async () => {
    const qc = new QueryClient()
    // Seed the list cache.
    qc.setQueryData(["documents", { limit: 50, offset: 0 }], {
      items: [makeDoc({ id: "d-1", status: "pending" })],
      total: 1,
      limit: 50,
      offset: 0,
    })

    const { unmount } = renderHook(() => useIngestionStatus(), {
      wrapper: makeWrapper(qc),
    })
    await waitFor(() =>
      expect(FakeSocket.instances).toHaveLength(1),
    )
    act(() => {
      FakeSocket.instances[0]!.dispatch("open", {})
    })
    act(() => {
      dispatchEvent(FakeSocket.instances[0]!, {
        type: "ingestion.status",
        document_id: "d-1",
        status: "parsing",
      })
    })
    await waitFor(() => {
      const data = qc.getQueryData<{
        items: Document[]
      }>(["documents", { limit: 50, offset: 0 }])
      expect(data?.items[0]?.status).toBe("parsing")
    })
    unmount()
  })

  it("patches the detail cache (Tasks 37, 40)", async () => {
    const qc = new QueryClient()
    qc.setQueryData(["documents", "d-1"], makeDoc({ status: "pending" }))

    const { unmount } = renderHook(() => useIngestionStatus(), {
      wrapper: makeWrapper(qc),
    })
    await waitFor(() =>
      expect(FakeSocket.instances).toHaveLength(1),
    )
    act(() => {
      FakeSocket.instances[0]!.dispatch("open", {})
    })
    act(() => {
      dispatchEvent(FakeSocket.instances[0]!, {
        type: "ingestion.status",
        document_id: "d-1",
        status: "indexed",
      })
    })
    await waitFor(() => {
      const data = qc.getQueryData<Document>(["documents", "d-1"])
      expect(data?.status).toBe("indexed")
    })
    unmount()
  })

  it("walks a document through the full happy path", async () => {
    const qc = new QueryClient()
    qc.setQueryData(["documents", "d-1"], makeDoc({ status: "pending" }))

    const { unmount } = renderHook(() => useIngestionStatus(), {
      wrapper: makeWrapper(qc),
    })
    await waitFor(() =>
      expect(FakeSocket.instances).toHaveLength(1),
    )
    act(() => {
      FakeSocket.instances[0]!.dispatch("open", {})
    })
    for (const status of ["parsing", "chunking", "embedding", "indexed"]) {
      act(() => {
        dispatchEvent(FakeSocket.instances[0]!, {
          type: "ingestion.status",
          document_id: "d-1",
          status,
        })
      })
    }
    await waitFor(() => {
      const data = qc.getQueryData<Document>(["documents", "d-1"])
      expect(data?.status).toBe("indexed")
    })
    unmount()
  })

  it("ignores out-of-order events (Task 44)", async () => {
    const qc = new QueryClient()
    qc.setQueryData(["documents", "d-1"], makeDoc({ status: "pending" }))

    const { unmount } = renderHook(() => useIngestionStatus(), {
      wrapper: makeWrapper(qc),
    })
    await waitFor(() =>
      expect(FakeSocket.instances).toHaveLength(1),
    )
    act(() => {
      FakeSocket.instances[0]!.dispatch("open", {})
    })
    // Spec example: embedding displayed, then
    // stale parsing arrives — stay at embedding.
    act(() => {
      dispatchEvent(FakeSocket.instances[0]!, {
        type: "ingestion.status",
        document_id: "d-1",
        status: "embedding",
      })
    })
    act(() => {
      dispatchEvent(FakeSocket.instances[0]!, {
        type: "ingestion.status",
        document_id: "d-1",
        status: "parsing",
      })
    })
    act(() => {
      dispatchEvent(FakeSocket.instances[0]!, {
        type: "ingestion.status",
        document_id: "d-1",
        status: "chunking",
      })
    })
    await waitFor(() => {
      const data = qc.getQueryData<Document>(["documents", "d-1"])
      expect(data?.status).toBe("embedding")
    })
    unmount()
  })

  it("updates multiple documents independently (Task 45)", async () => {
    const qc = new QueryClient()
    qc.setQueryData(["documents", "A"], makeDoc({ id: "A", status: "pending" }))
    qc.setQueryData(["documents", "B"], makeDoc({ id: "B", status: "pending" }))
    qc.setQueryData(["documents", "C"], makeDoc({ id: "C", status: "pending" }))

    const { unmount } = renderHook(() => useIngestionStatus(), {
      wrapper: makeWrapper(qc),
    })
    await waitFor(() =>
      expect(FakeSocket.instances).toHaveLength(1),
    )
    act(() => {
      FakeSocket.instances[0]!.dispatch("open", {})
    })
    act(() => {
      dispatchEvent(FakeSocket.instances[0]!, {
        type: "ingestion.status",
        document_id: "A",
        status: "parsing",
      })
    })
    act(() => {
      dispatchEvent(FakeSocket.instances[0]!, {
        type: "ingestion.status",
        document_id: "B",
        status: "embedding",
      })
    })
    act(() => {
      dispatchEvent(FakeSocket.instances[0]!, {
        type: "ingestion.status",
        document_id: "C",
        status: "indexed",
      })
    })
    await waitFor(() => {
      expect(qc.getQueryData<Document>(["documents", "A"])?.status).toBe("parsing")
      expect(qc.getQueryData<Document>(["documents", "B"])?.status).toBe("embedding")
      expect(qc.getQueryData<Document>(["documents", "C"])?.status).toBe("indexed")
    })
    unmount()
  })

  it("ignores malformed events (Task 48)", async () => {
    const qc = new QueryClient()
    qc.setQueryData(["documents", "d-1"], makeDoc({ status: "pending" }))

    const { unmount } = renderHook(() => useIngestionStatus(), {
      wrapper: makeWrapper(qc),
    })
    await waitFor(() =>
      expect(FakeSocket.instances).toHaveLength(1),
    )
    act(() => {
      FakeSocket.instances[0]!.dispatch("open", {})
    })
    // Malformed JSON, unknown event type, unknown status.
    act(() => {
      FakeSocket.instances[0]!.dispatch("message", { data: "not json" })
      FakeSocket.instances[0]!.dispatch("message", {
        data: JSON.stringify({ type: "wat" }),
      })
      FakeSocket.instances[0]!.dispatch("message", {
        data: JSON.stringify({
          type: "ingestion.status",
          document_id: "d-1",
          status: "nope",
        }),
      })
    })
    // The document is unchanged.
    const data = qc.getQueryData<Document>(["documents", "d-1"])
    expect(data?.status).toBe("pending")
    unmount()
  })

  it("tears down the socket when the last consumer unmounts (Task 46)", async () => {
    const qc = new QueryClient()
    const first = renderHook(() => useIngestionStatus(), {
      wrapper: makeWrapper(qc),
    })
    await waitFor(() =>
      expect(FakeSocket.instances).toHaveLength(1),
    )
    const initialSocket = FakeSocket.instances[0]!
    const second = renderHook(() => useIngestionStatus(), {
      wrapper: makeWrapper(qc),
    })
    // Still one shared connection.
    expect(FakeSocket.instances).toHaveLength(1)
    // Unmount the first consumer; the second
    // still holds a ref.
    first.unmount()
    // Still one connection.
    expect(FakeSocket.instances).toHaveLength(1)
    expect(initialSocket.closed).toBe(false)
    // Unmount the second.
    second.unmount()
    // The socket is closed (FakeSocket.close()
    // dispatches a close event synchronously).
    expect(initialSocket.closed).toBe(true)
  })

  it("does not connect when there is no access token", () => {
    useAuthStore.setState({ accessToken: null })
    const qc = new QueryClient()
    const { result, unmount } = renderHook(() => useIngestionStatus(), {
      wrapper: makeWrapper(qc),
    })
    expect(FakeSocket.instances).toHaveLength(0)
    expect(result.current.connectionState).toBe("closed")
    unmount()
  })

  // -------------------------------------------------------------------
  // V11.5 — polling fallback behaviour
  // -------------------------------------------------------------------
  // The hook watches the documents list cache
  // for in-flight rows and, when the WebSocket
  // is down, invalidates the list query on a
  // 5s cadence so the UI keeps moving toward
  // the terminal state. These tests pin:
  //   1. With WS closed + no in-flight docs:
  //      state is ``closed`` (not polling).
  //   2. With WS closed + in-flight docs:
  //      state is ``polling`` + list query is
  //      invalidated on the cadence.
  //   3. Once in-flight docs reach a terminal
  //      state, polling stops and the state
  //      returns to ``closed``.
  //   4. When the WS is open, polling does not
  //      run even if in-flight docs exist
  //      (WS is the source of truth).
  //   5. Without an access token, no polling
  //      runs.
  //
  // **No fake timers.** ``vi.useFakeTimers()``
  // breaks the real-clock polling that
  // ``@testing-library/react``'s ``waitFor``
  // uses internally, so we drive the cadence
  // forward with real ``setTimeout`` calls.

  it("V11.5 — reports 'polling' when WS is closed and in-flight docs exist", async () => {
    const qc = new QueryClient()
    // Seed a list with one in-flight doc.
    qc.setQueryData(["documents", { limit: 50, offset: 0 }], {
      items: [makeDoc({ id: "d-1", status: "pending" })],
      total: 1,
      limit: 50,
      offset: 0,
    })

    const { result, unmount } = renderHook(() => useIngestionStatus(), {
      wrapper: makeWrapper(qc),
    })
    // Drive the WS into the closed state.
    await waitFor(() =>
      expect(FakeSocket.instances).toHaveLength(1),
    )
    act(() => {
      FakeSocket.instances[0]!.dispatch("open", {})
      FakeSocket.instances[0]!.dispatch("close", { code: 1006 })
    })
    // The hook should fall back to polling now
    // because the WS is down + we have an
    // in-flight doc.
    await waitFor(() =>
      expect(result.current.connectionState).toBe("polling"),
    )
    unmount()
  })

  it("V11.5 — invalidates the documents list on a 5s cadence while polling", async () => {
    const qc = new QueryClient()
    qc.setQueryData(["documents", { limit: 50, offset: 0 }], {
      items: [makeDoc({ id: "d-1", status: "pending" })],
      total: 1,
      limit: 50,
      offset: 0,
    })
    // Spy on the invalidation call.
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries")
    // Spy on setInterval so the test can pin the
    // exact cadence without actually waiting 5s.
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval")

    const { result, unmount } = renderHook(() => useIngestionStatus(), {
      wrapper: makeWrapper(qc),
    })
    await waitFor(() =>
      expect(FakeSocket.instances).toHaveLength(1),
    )
    act(() => {
      FakeSocket.instances[0]!.dispatch("open", {})
      FakeSocket.instances[0]!.dispatch("close", { code: 1006 })
    })
    await waitFor(() =>
      expect(result.current.connectionState).toBe("polling"),
    )
    // The polling interval must be set up with
    // the documented cadence (5_000ms). We don't
    // actually wait for the timer to fire — that
    // would add 5s to every CI run; the spy pin
    // is the contract.
    const intervalCall = setIntervalSpy.mock.calls.find(
      (c) => c[1] === 5_000,
    )
    expect(intervalCall).toBeDefined()
    // And the immediate refetch landed as soon
    // as polling started (one invalidate per
    // hook, before the interval is even armed).
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["documents"],
    })
    setIntervalSpy.mockRestore()
    unmount()
  })

  it("V11.5 — stops polling when all in-flight docs reach a terminal state", async () => {
    const qc = new QueryClient()
    qc.setQueryData(["documents", { limit: 50, offset: 0 }], {
      items: [makeDoc({ id: "d-1", status: "pending" })],
      total: 1,
      limit: 50,
      offset: 0,
    })

    const { result, unmount } = renderHook(() => useIngestionStatus(), {
      wrapper: makeWrapper(qc),
    })
    await waitFor(() =>
      expect(FakeSocket.instances).toHaveLength(1),
    )
    act(() => {
      FakeSocket.instances[0]!.dispatch("open", {})
      FakeSocket.instances[0]!.dispatch("close", { code: 1006 })
    })
    await waitFor(() =>
      expect(result.current.connectionState).toBe("polling"),
    )

    // Simulate the doc reaching ``indexed``
    // via a cache update (the same way the
    // list refetch would land).
    act(() => {
      qc.setQueryData(["documents", { limit: 50, offset: 0 }], {
        items: [makeDoc({ id: "d-1", status: "indexed" })],
        total: 1,
        limit: 50,
        offset: 0,
      })
    })
    // The hook should drop back to ``closed``
    // because there are no in-flight docs
    // anymore.
    await waitFor(() =>
      expect(result.current.connectionState).toBe("closed"),
    )
    unmount()
  })

  it("V11.5 — does not poll when the WebSocket is open", async () => {
    const qc = new QueryClient()
    qc.setQueryData(["documents", { limit: 50, offset: 0 }], {
      items: [makeDoc({ id: "d-1", status: "pending" })],
      total: 1,
      limit: 50,
      offset: 0,
    })
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries")

    const { result, unmount } = renderHook(() => useIngestionStatus(), {
      wrapper: makeWrapper(qc),
    })
    await waitFor(() =>
      expect(FakeSocket.instances).toHaveLength(1),
    )
    act(() => {
      FakeSocket.instances[0]!.dispatch("open", {})
    })
    await waitFor(() =>
      expect(result.current.connectionState).toBe("open"),
    )
    // No polling happened.
    expect(invalidateSpy).not.toHaveBeenCalled()
    // Give the cadence room to run — it must
    // not start polling.
    await new Promise((r) => setTimeout(r, 200))
    expect(invalidateSpy).not.toHaveBeenCalled()
    unmount()
  })

  it("V11.5 — does not poll without an access token", async () => {
    useAuthStore.setState({ accessToken: null })
    const qc = new QueryClient()
    qc.setQueryData(["documents", { limit: 50, offset: 0 }], {
      items: [makeDoc({ id: "d-1", status: "pending" })],
      total: 1,
      limit: 50,
      offset: 0,
    })
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries")

    const { result, unmount } = renderHook(() => useIngestionStatus(), {
      wrapper: makeWrapper(qc),
    })
    expect(result.current.connectionState).toBe("closed")
    await new Promise((r) => setTimeout(r, 200))
    expect(invalidateSpy).not.toHaveBeenCalled()
    unmount()
  })
})
