/**
 * WebSocket client — F3 Part 4 (Task 32).
 *
 * The client is a hand-rolled class on top of the
 * browser `WebSocket`. The tests stub the global
 * `WebSocket` with a minimal in-memory stand-in
 * that supports `addEventListener`, `send`,
 * `close`, and lets the test dispatch synthetic
 * `open` / `message` / `error` / `close` events.
 *
 * **Coverage.**
 *   - The connection state machine.
 *   - The message dispatch (text vs binary).
 *   - Reconnection (closed → schedule → open).
 *   - Disconnect cancels the reconnect loop.
 *   - The send queue drains on `open`.
 *   - Exponential backoff + jitter (Task 43).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  nextReconnectDelay,
  WebSocketClient,
  type WebSocketState,
} from "@/lib/websocket/client"

/**
 * Minimal in-memory WebSocket stand-in. Not
 * exhaustive — only the methods the client uses.
 */
class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  static reset() {
    FakeWebSocket.instances = []
  }
  url: string
  protocols?: string | string[]
  readyState = 0 // CONNECTING
  sent: string[] = []
  closed = false
  // Listeners keyed by event name.
  private listeners = new Map<string, Array<(e: unknown) => void>>()

  constructor(url: string, protocols?: string | string[]) {
    this.url = url
    this.protocols = protocols
    FakeWebSocket.instances.push(this)
  }

  addEventListener(name: string, cb: (e: unknown) => void): void {
    if (!this.listeners.has(name)) this.listeners.set(name, [])
    this.listeners.get(name)!.push(cb)
  }
  removeEventListener(name: string, cb: (e: unknown) => void): void {
    const arr = this.listeners.get(name)
    if (!arr) return
    const idx = arr.indexOf(cb)
    if (idx >= 0) arr.splice(idx, 1)
  }
  send(data: string): void {
    if (this.closed) throw new Error("socket closed")
    this.sent.push(data)
  }
  close(code?: number, _reason?: string): void {
    this.closed = true
    this.readyState = 3 // CLOSED
    this.dispatch("close", { code: code ?? 1000, reason: "" })
  }
  // Test helpers
  dispatch(name: string, payload: unknown): void {
    for (const cb of this.listeners.get(name) ?? []) cb(payload)
  }
}

beforeEach(() => {
  FakeWebSocket.reset()
  vi.stubGlobal(
    "WebSocket",
    vi.fn((url: string, protocols?: string | string[]) => {
      return new FakeWebSocket(url, protocols)
    }) as unknown as typeof WebSocket,
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("WebSocketClient", () => {
  it("opens a connection on connect() and reports state transitions", () => {
    const states: WebSocketState[] = []
    const client = new WebSocketClient({
      url: "ws://test/ws/ingestion?token=x",
      onStateChange: (s) => states.push(s),
    })

    client.connect()

    // We just called connect(); the FakeWebSocket
    // exists, no `open` has been dispatched yet.
    const sock = FakeWebSocket.instances[0]!
    expect(client.getState()).toBe("connecting")
    expect(states).toEqual(["connecting"])

    // Dispatch the synthetic open.
    sock.dispatch("open", {})
    expect(client.getState()).toBe("open")
    expect(states).toEqual(["connecting", "open"])
  })

  it("passes the URL + protocols to the WebSocket constructor", () => {
    const client = new WebSocketClient({
      url: "ws://test/ws/x?token=abc",
      protocols: ["bearer", "abc"],
    })
    client.connect()
    const sock = FakeWebSocket.instances[0]!
    expect(sock.url).toBe("ws://test/ws/x?token=abc")
    expect(sock.protocols).toEqual(["bearer", "abc"])
  })

  it("dispatches text messages to onMessage", () => {
    const onMessage = vi.fn()
    const client = new WebSocketClient({
      url: "ws://test",
      onMessage,
    })
    client.connect()
    const sock = FakeWebSocket.instances[0]!
    sock.dispatch("open", {})
    sock.dispatch("message", { data: "hello" })
    sock.dispatch("message", { data: "world" })
    expect(onMessage).toHaveBeenCalledTimes(2)
    expect(onMessage).toHaveBeenNthCalledWith(1, "hello")
    expect(onMessage).toHaveBeenNthCalledWith(2, "world")
    client.disconnect()
  })

  it("queues messages sent while connecting and drains on open", () => {
    const client = new WebSocketClient({ url: "ws://test" })
    client.connect()
    // Send before the open event.
    client.send("queued-1")
    client.send("queued-2")
    const sock = FakeWebSocket.instances[0]!
    // Socket hasn't received anything yet.
    expect(sock.sent).toEqual([])
    sock.dispatch("open", {})
    // The queue drained.
    expect(sock.sent).toEqual(["queued-1", "queued-2"])
    // Sending now goes straight through.
    client.send("live")
    expect(sock.sent).toEqual(["queued-1", "queued-2", "live"])
    client.disconnect()
  })

  it("returns false from send() when the socket is dead (does not throw)", () => {
    const client = new WebSocketClient({ url: "ws://test" })
    // No connect → no socket.
    expect(client.send("x")).toBe(false)
  })

  it("schedules a reconnect on an unexpected close", () => {
    vi.useFakeTimers()
    const states: WebSocketState[] = []
    const client = new WebSocketClient({
      url: "ws://test",
      initialReconnectDelayMs: 100,
      onStateChange: (s) => states.push(s),
    })
    client.connect()
    const sock = FakeWebSocket.instances[0]!
    sock.dispatch("open", {})
    expect(client.getState()).toBe("open")
    // Unexpected close.
    sock.dispatch("close", { code: 1006, reason: "" })
    expect(client.getState()).toBe("closed")
    // Only one socket exists so far — the reconnect
    // is scheduled (setTimeout) but hasn't fired.
    expect(FakeWebSocket.instances).toHaveLength(1)
    // Fast-forward the timer → the reconnect fires.
    vi.advanceTimersByTime(200)
    // A new socket was created.
    expect(FakeWebSocket.instances).toHaveLength(2)
  })

  it("disconnect() cancels the reconnect loop", () => {
    vi.useFakeTimers()
    const client = new WebSocketClient({
      url: "ws://test",
      initialReconnectDelayMs: 100,
    })
    client.connect()
    const sock = FakeWebSocket.instances[0]!
    sock.dispatch("open", {})
    sock.dispatch("close", { code: 1006, reason: "" })
    // The reconnect is scheduled; only the original
    // socket exists.
    expect(FakeWebSocket.instances).toHaveLength(1)
    // Disconnect before the timer fires.
    client.disconnect()
    vi.advanceTimersByTime(1000)
    // The reconnect was cancelled — no second socket.
    expect(FakeWebSocket.instances).toHaveLength(1)
  })

  it("connect() is idempotent while connecting/open", () => {
    const client = new WebSocketClient({ url: "ws://test" })
    client.connect()
    client.connect()
    expect(FakeWebSocket.instances).toHaveLength(1)
  })

  it("isOpen() returns true only when the socket is open", () => {
    const client = new WebSocketClient({ url: "ws://test" })
    client.connect()
    expect(client.isOpen()).toBe(false)
    const sock = FakeWebSocket.instances[0]!
    sock.dispatch("open", {})
    expect(client.isOpen()).toBe(true)
    client.disconnect()
  })
})

describe("nextReconnectDelay", () => {
  it("grows exponentially up to the max", () => {
    const opts = {
      initialReconnectDelayMs: 500,
      maxReconnectDelayMs: 30_000,
      reconnectBackoffFactor: 2,
      reconnectJitter: 0,
    }
    expect(nextReconnectDelay(0, opts)).toBe(500)
    expect(nextReconnectDelay(1, opts)).toBe(1000)
    expect(nextReconnectDelay(2, opts)).toBe(2000)
    expect(nextReconnectDelay(3, opts)).toBe(4000)
  })

  it("caps at the max delay", () => {
    const opts = {
      initialReconnectDelayMs: 1000,
      maxReconnectDelayMs: 5000,
      reconnectBackoffFactor: 2,
      reconnectJitter: 0,
    }
    expect(nextReconnectDelay(10, opts)).toBe(5000)
  })

  it("applies jitter within the configured range", () => {
    const opts = {
      initialReconnectDelayMs: 1000,
      maxReconnectDelayMs: 30_000,
      reconnectBackoffFactor: 2,
      reconnectJitter: 0.5,
    }
    // With 50% jitter on a 1000ms base, the value
    // is in [500, 1500].
    for (let i = 0; i < 20; i++) {
      const v = nextReconnectDelay(0, opts)
      expect(v).toBeGreaterThanOrEqual(500)
      expect(v).toBeLessThanOrEqual(1500)
    }
  })
})
