/**
 * IngestionSocket — F3 Part 4 (Task 33).
 *
 * The service specializes the generic
 * WebSocketClient: it builds the URL from
 * NEXT_PUBLIC_WS_URL + the access token, parses
 * the frames, applies stale-event filtering, and
 * notifies subscribers.
 *
 * The test stubs the global `WebSocket` so we can
 * drive synthetic events without a network.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  buildIngestionSocketUrl,
  IngestionSocket,
} from "@/services/documents/ingestionSocket"

class FakeSocket {
  static instances: FakeSocket[] = []
  static reset() {
    FakeSocket.instances = []
  }
  url: string
  protocols?: string | string[]
  sent: string[] = []
  closed = false
  private listeners = new Map<string, Array<(e: unknown) => void>>()
  constructor(url: string, protocols?: string | string[]) {
    this.url = url
    this.protocols = protocols
    FakeSocket.instances.push(this)
  }
  addEventListener(name: string, cb: (e: unknown) => void): void {
    if (!this.listeners.has(name)) this.listeners.set(name, [])
    this.listeners.get(name)!.push(cb)
  }
  removeEventListener(): void {}
  send(data: string): void {
    this.sent.push(data)
  }
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
    vi.fn((url: string, protocols?: string | string[]) => {
      return new FakeSocket(url, protocols)
    }) as unknown as typeof WebSocket,
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("buildIngestionSocketUrl", () => {
  it("uses NEXT_PUBLIC_WS_URL + /ws/ingestion + ?token=...", () => {
    const url = buildIngestionSocketUrl("abc.def.ghi")
    // The exact host depends on the env, but the
    // path + query are guaranteed.
    expect(url).toContain("/ws/ingestion")
    expect(url).toContain("token=abc.def.ghi")
  })

  it("URL-encodes special characters in the token", () => {
    const url = buildIngestionSocketUrl("a b/c?d=1")
    // The browser's URLSearchParams handles the
    // encoding; the result is a parseable URL.
    const parsed = new URL(url)
    expect(parsed.searchParams.get("token")).toBe("a b/c?d=1")
  })
})

describe("IngestionSocket", () => {
  it("parses well-formed events and notifies subscribers", () => {
    const socket = new IngestionSocket({ accessToken: "tok" })
    const received: string[] = []
    socket.subscribe((event) => {
      if (event.type === "ingestion.status") received.push(event.status)
    })
    socket.connect()
    const sock = FakeSocket.instances[0]!
    sock.dispatch("open", {})
    sock.dispatch(
      "message",
      {
        data: JSON.stringify({
          type: "ingestion.status",
          document_id: "doc-1",
          status: "parsing",
        }),
      },
    )
    expect(received).toEqual(["parsing"])
    socket.disconnect()
  })

  it("ignores a stale event (already at the new status or later)", () => {
    const socket = new IngestionSocket({ accessToken: "tok" })
    const received: string[] = []
    socket.subscribe((event) => {
      if (event.type === "ingestion.status") received.push(event.status)
    })
    socket.connect()
    const sock = FakeSocket.instances[0]!
    sock.dispatch("open", {})
    // Advance: parsing → chunking.
    sock.dispatch(
      "message",
      { data: JSON.stringify({ type: "ingestion.status", document_id: "d", status: "parsing" }) },
    )
    sock.dispatch(
      "message",
      { data: JSON.stringify({ type: "ingestion.status", document_id: "d", status: "chunking" }) },
    )
    // Stale: parsing arrives after chunking → dropped.
    sock.dispatch(
      "message",
      { data: JSON.stringify({ type: "ingestion.status", document_id: "d", status: "parsing" }) },
    )
    expect(received).toEqual(["parsing", "chunking"])
    socket.disconnect()
  })

  it("treats failed as terminal — applies after every other status", () => {
    const socket = new IngestionSocket({ accessToken: "tok" })
    const received: string[] = []
    socket.subscribe((event) => {
      if (event.type === "ingestion.status") received.push(event.status)
    })
    socket.connect()
    const sock = FakeSocket.instances[0]!
    sock.dispatch("open", {})
    for (const s of ["parsing", "embedding", "indexed", "failed"]) {
      sock.dispatch("message", {
        data: JSON.stringify({
          type: "ingestion.status",
          document_id: "d",
          status: s,
        }),
      })
    }
    expect(received).toEqual(["parsing", "embedding", "indexed", "failed"])
    socket.disconnect()
  })

  it("tracks multiple documents independently (Task 45)", () => {
    const socket = new IngestionSocket({ accessToken: "tok" })
    const final: Record<string, string> = {}
    socket.subscribe((event) => {
      if (event.type === "ingestion.status") {
        final[event.document_id] = event.status
      }
    })
    socket.connect()
    const sock = FakeSocket.instances[0]!
    sock.dispatch("open", {})
    sock.dispatch("message", {
      data: JSON.stringify({ type: "ingestion.status", document_id: "A", status: "parsing" }),
    })
    sock.dispatch("message", {
      data: JSON.stringify({ type: "ingestion.status", document_id: "B", status: "embedding" }),
    })
    sock.dispatch("message", {
      data: JSON.stringify({ type: "ingestion.status", document_id: "C", status: "indexed" }),
    })
    expect(final).toEqual({ A: "parsing", B: "embedding", C: "indexed" })
    socket.disconnect()
  })

  it("ignores malformed events (Task 48)", () => {
    const socket = new IngestionSocket({ accessToken: "tok" })
    const spy = vi.fn()
    socket.subscribe(spy)
    socket.connect()
    const sock = FakeSocket.instances[0]!
    sock.dispatch("open", {})
    // Bad JSON, unknown type, unknown status, missing id.
    sock.dispatch("message", { data: "not json" })
    sock.dispatch("message", { data: JSON.stringify({ type: "wat" }) })
    sock.dispatch("message", {
      data: JSON.stringify({ type: "ingestion.status", document_id: "x", status: "nope" }),
    })
    sock.dispatch("message", {
      data: JSON.stringify({ type: "ingestion.status", status: "indexed" }),
    })
    expect(spy).not.toHaveBeenCalled()
    socket.disconnect()
  })

  it("getStatus() reflects the latest event", () => {
    const socket = new IngestionSocket({ accessToken: "tok" })
    socket.connect()
    const sock = FakeSocket.instances[0]!
    sock.dispatch("open", {})
    expect(socket.getStatus("d-1")).toBeNull()
    sock.dispatch("message", {
      data: JSON.stringify({
        type: "ingestion.status",
        document_id: "d-1",
        status: "embedding",
      }),
    })
    expect(socket.getStatus("d-1")).toBe("embedding")
    socket.disconnect()
  })

  it("returns a fresh unsubscribe function for each subscribe()", () => {
    const socket = new IngestionSocket({ accessToken: "tok" })
    const a = vi.fn()
    const b = vi.fn()
    const offA = socket.subscribe(a)
    socket.subscribe(b)
    socket.connect()
    const sock = FakeSocket.instances[0]!
    sock.dispatch("open", {})
    sock.dispatch("message", {
      data: JSON.stringify({ type: "ingestion.status", document_id: "d", status: "parsing" }),
    })
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    offA()
    sock.dispatch("message", {
      data: JSON.stringify({ type: "ingestion.status", document_id: "d", status: "chunking" }),
    })
    expect(a).toHaveBeenCalledTimes(1) // not called again
    expect(b).toHaveBeenCalledTimes(2)
    socket.disconnect()
  })

  it("broadcasts connection state transitions", () => {
    const socket = new IngestionSocket({ accessToken: "tok" })
    const states: string[] = []
    socket.subscribeState((s) => states.push(s))
    socket.connect()
    const sock = FakeSocket.instances[0]!
    sock.dispatch("open", {})
    expect(states).toEqual(["connecting", "open"])
    socket.disconnect()
    // disconnect() sets state to "closing" and
    // then the underlying socket close fires a
    // close event → the service (via the
    // WebSocketClient) transitions to "closed".
    // Since disconnect() is user-initiated, the
    // reconnect loop is cancelled and the final
    // state is "closed".
    expect(states).toEqual(["connecting", "open", "closing", "closed"])
  })
})
