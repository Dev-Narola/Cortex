/**
 * ConversationSocket — F4 Part 2 (Tasks 15 + 16).
 *
 * Mirrors the F3 Part 4 ingestion-socket test.
 * We stub the global WebSocket with a
 * minimal in-memory stand-in that supports
 * `addEventListener` + `send` + `close` and
 * lets the test dispatch synthetic
 * `open` / `message` / `close` events.
 *
 * **Coverage.**
 *   - URL building (path + ?token=… contract).
 *   - `sendMessage` envelope shape
 *     (`{"type": "message", "content": "…"}`).
 *   - Frame dispatch: parsed events flow
 *     through to subscribers.
 *   - State subscriptions: connection
 *     transitions surface to listeners.
 *   - Malformed frames are dropped with
 *     a `console.warn` (no crash).
 *   - `disconnect()` cancels the reconnection
 *     loop (the underlying `WebSocketClient`
 *     owns this; we just verify the close
 *     call cascades).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  buildConversationSocketUrl,
  ConversationSocket,
} from "@/lib/websocket/conversation-client"

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

describe("buildConversationSocketUrl", () => {
  it("uses NEXT_PUBLIC_WS_URL + /ws/conversations/{id} + ?token=...", () => {
    const url = buildConversationSocketUrl("conv-1", "abc.def.ghi")
    expect(url).toContain("/ws/conversations/conv-1")
    expect(url).toContain("token=abc.def.ghi")
  })

  it("URL-encodes special characters in the conversation id", () => {
    const url = buildConversationSocketUrl("a/b c", "tok")
    // Forward-slash + space must be encoded
    // to keep the path a single segment.
    expect(url).not.toMatch(/\/ws\/conversations\/a\/ b c/)
    // The encoded form is opaque to the
    // browser, but the URL must still parse.
    expect(() => new URL(url)).not.toThrow()
  })
})

describe("ConversationSocket", () => {
  it("connects to the right URL on connect()", () => {
    const socket = new ConversationSocket({
      conversationId: "c-1",
      accessToken: "t-1",
    })
    socket.connect()
    expect(FakeSocket.instances).toHaveLength(1)
    expect(FakeSocket.instances[0]!.url).toContain("/ws/conversations/c-1")
    expect(FakeSocket.instances[0]!.url).toContain("token=t-1")
  })

  it("sends the user message in the backend envelope shape", () => {
    const socket = new ConversationSocket({
      conversationId: "c-1",
      accessToken: "t-1",
    })
    socket.connect()
    // FakeSocket is in CONNECTING; the
    // WebSocketClient queues the message
    // and drains on `open`.
    const ok = socket.sendMessage("What is Cortex?")
    expect(ok).toBe(true)
    const inst = FakeSocket.instances[0]!
    // Drain the queue by dispatching open.
    inst.dispatch("open", {})
    expect(inst.sent).toHaveLength(1)
    expect(JSON.parse(inst.sent[0]!)).toEqual({
      type: "message",
      content: "What is Cortex?",
    })
  })

  it("rejects empty messages", () => {
    const socket = new ConversationSocket({
      conversationId: "c-1",
      accessToken: "t-1",
    })
    socket.connect()
    expect(socket.sendMessage("   ")).toBe(false)
    expect(FakeSocket.instances[0]!.sent).toHaveLength(0)
  })

  it("dispatches parsed events to subscribers", () => {
    const socket = new ConversationSocket({
      conversationId: "c-1",
      accessToken: "t-1",
    })
    socket.connect()
    const seen: unknown[] = []
    socket.subscribe((e) => seen.push(e))
    const inst = FakeSocket.instances[0]!
    inst.dispatch("message", {
      data: JSON.stringify({ type: "token", content: "Hi" }),
    })
    inst.dispatch("message", {
      data: JSON.stringify({ type: "message_start", message_id: "m-1" }),
    })
    expect(seen).toEqual([
      { type: "token", content: "Hi" },
      { type: "message_start", messageId: "m-1" },
    ])
  })

  it("ignores malformed frames (no crash)", () => {
    const socket = new ConversationSocket({
      conversationId: "c-1",
      accessToken: "t-1",
    })
    socket.connect()
    const seen: unknown[] = []
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    socket.subscribe((e) => seen.push(e))
    const inst = FakeSocket.instances[0]!
    inst.dispatch("message", { data: "not json" })
    inst.dispatch("message", {
      data: JSON.stringify({ type: "wat" }),
    })
    expect(seen).toEqual([])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it("dispatches connection-state transitions", () => {
    const socket = new ConversationSocket({
      conversationId: "c-1",
      accessToken: "t-1",
    })
    socket.connect()
    const states: string[] = []
    socket.subscribeState((s) => states.push(s))
    const inst = FakeSocket.instances[0]!
    inst.dispatch("open", {})
    inst.dispatch("close", { code: 1000 })
    expect(states).toEqual(["open", "closed"])
  })

  it("disconnect() closes the socket and prevents further sends", () => {
    const socket = new ConversationSocket({
      conversationId: "c-1",
      accessToken: "t-1",
    })
    socket.connect()
    const inst = FakeSocket.instances[0]!
    inst.dispatch("open", {})
    socket.disconnect()
    expect(inst.closed).toBe(true)
    expect(socket.sendMessage("after disconnect")).toBe(false)
  })
})
