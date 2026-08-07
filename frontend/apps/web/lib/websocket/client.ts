/**
 * WebSocket client — the generic transport.
 *
 * **F3 Part 4 (Task 32).** The UI never
 * instantiates `new WebSocket()` directly. Every
 * consumer goes through this client, which owns
 * the connection lifecycle, reconnection, and
 * message routing.
 *
 * **Why a hand-rolled class (not `reconnecting-
 * websocket` / `socket.io` / etc.).** Three
 * reasons:
 *   1. The backend doesn't ship a WS library
 *      contract yet (the V4 ingestion WS lands
 *      alongside this part). Until then, a
 *      minimal native client is the smallest
 *      thing that works.
 *   2. The auth story is "Bearer in a query
 *      param" (browsers can't set custom headers
 *      on `new WebSocket`). Owning the client
 *      keeps the token-injection logic obvious.
 *   3. Reconnection policy needs the same
 *      discipline as the rest of the auth
 *      stack (silent refresh, 401-driven
 *      reconnect). Pulling that in via a third
 *      party would be more code than the
 *      reconnection loop itself.
 *
 * **Connection state.** The client tracks its
 * own state machine — `idle | connecting |
 * open | closing | closed`. Consumers subscribe
 * via `onStateChange`. The state is the only
 * piece the UI shows to the user (per Task 42).
 *
 * **Reconnection.** Exponential backoff with a
 * 30s cap + jitter (per Task 43). The loop is
 * driven by `scheduleReconnect` after any
 * unexpected close. `disconnect()` cancels the
 * loop + closes the socket immediately.
 *
 * **Backpressure / queueing.** A small
 * in-memory queue holds messages pushed while
 * the socket is `connecting`; they're drained on
 * `open`. The client never throws on `send()` —
 * it returns `false` if the socket is dead.
 *
 * **SSR safety.** The constructor is a no-op
 * when `WebSocket` isn't in the global scope
 * (Next.js server build). Every public method
 * checks for a live socket before touching it.
 */

export type WebSocketState =
  | "idle"
  | "connecting"
  | "open"
  | "closing"
  | "closed"

export type WebSocketReadyState = WebSocketState

export interface WebSocketClientOptions {
  /** Absolute URL to connect to (e.g. `ws://host/ws/ingestion?token=…`). */
  url: string
  /**
   * Subprotocols to advertise. Some servers use
   * `Sec-WebSocket-Protocol` to carry the auth
   * token (the browser-safe alternative to
   * custom headers). Default: none.
   */
  protocols?: string | string[]
  /** Max reconnect delay (ms). Default 30 000. */
  maxReconnectDelayMs?: number
  /** Initial reconnect delay (ms). Default 500. */
  initialReconnectDelayMs?: number
  /** Multiplier for exponential backoff. Default 2. */
  reconnectBackoffFactor?: number
  /** Optional jitter fraction (0..1). Default 0.2. */
  reconnectJitter?: number
  /**
   * Called when the state transitions. Use
   * this for connection indicators, not for
   * message routing (use onMessage).
   */
  onStateChange?: (state: WebSocketState) => void
  /** Called for every successfully-parsed message. */
  onMessage?: (data: string) => void
  /**
   * Called for low-level socket errors. The
   * client handles reconnection; consumers
   * usually just want to log.
   */
  onError?: (event: Event) => void
}

const DEFAULTS = {
  maxReconnectDelayMs: 30_000,
  initialReconnectDelayMs: 500,
  reconnectBackoffFactor: 2,
  reconnectJitter: 0.2,
}

/**
 * Compute the next reconnect delay using
 * exponential backoff + jitter. Exported so
 * tests can pin the schedule.
 */
export function nextReconnectDelay(
  attempt: number,
  opts: Required<
    Pick<
      WebSocketClientOptions,
      | "initialReconnectDelayMs"
      | "maxReconnectDelayMs"
      | "reconnectBackoffFactor"
      | "reconnectJitter"
    >
  >,
): number {
  const base = Math.min(
    opts.maxReconnectDelayMs,
    opts.initialReconnectDelayMs *
      Math.pow(opts.reconnectBackoffFactor, attempt),
  )
  // Jitter: +/- jitter% of the base.
  const jitterRange = base * opts.reconnectJitter
  const jitter = (Math.random() * 2 - 1) * jitterRange
  return Math.max(0, Math.floor(base + jitter))
}

export class WebSocketClient {
  private socket: WebSocket | null = null
  private state: WebSocketState = "idle"
  private attempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private queue: string[] = []
  private opts: WebSocketClientOptions & {
    maxReconnectDelayMs: number
    initialReconnectDelayMs: number
    reconnectBackoffFactor: number
    reconnectJitter: number
  }
  private closedByUser = false

  constructor(options: WebSocketClientOptions) {
    this.opts = {
      ...DEFAULTS,
      ...options,
    }
  }

  // -----------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------

  /** Open the connection. Idempotent: a no-op if already open. */
  connect(): void {
    if (typeof WebSocket === "undefined") {
      // SSR / test env. No-op.
      return
    }
    if (
      this.state === "open" ||
      this.state === "connecting"
    ) {
      return
    }
    this.closedByUser = false
    this.openSocket()
  }

  /**
   * Close the connection + cancel any pending
   * reconnect. Idempotent. After this call, the
   * client will not reconnect until `connect()`.
   */
  disconnect(): void {
    this.closedByUser = true
    this.cancelReconnect()
    if (this.socket) {
      this.setState("closing")
      try {
        this.socket.close(1000, "client disconnect")
      } catch {
        // ignore — the socket may already be dead
      }
    } else {
      this.setState("closed")
    }
  }

  /**
   * Send a message. Returns `true` if the message
   * was queued / sent, `false` if the socket is
   * dead and the message was dropped. We don't
   * throw — the WebSocket layer must never crash
   * the UI.
   */
  send(message: string): boolean {
    if (this.state === "open" && this.socket) {
      try {
        this.socket.send(message)
        return true
      } catch {
        return false
      }
    }
    // Buffer for the next `open` (cap at 100 to
    // avoid unbounded growth during long outages).
    if (this.queue.length < 100) {
      this.queue.push(message)
    }
    return false
  }

  /** Current connection state. */
  getState(): WebSocketState {
    return this.state
  }

  /** True while the socket is open. */
  isOpen(): boolean {
    return this.state === "open"
  }

  // -----------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------

  private openSocket(): void {
    if (typeof WebSocket === "undefined") return
    this.setState("connecting")
    try {
      this.socket = new WebSocket(
        this.opts.url,
        this.opts.protocols,
      )
    } catch (err) {
      // The constructor can throw if the URL is
      // malformed. Treat as a fatal close so we
      // schedule a reconnect (the next attempt
      // will hit the same error, but the user
      // can refresh to fix the env var).
      this.opts.onError?.(err as unknown as Event)
      this.handleClose()
      return
    }
    this.socket.addEventListener("open", this.handleOpen)
    this.socket.addEventListener("message", this.handleMessage)
    this.socket.addEventListener("error", this.handleError)
    this.socket.addEventListener("close", this.handleCloseEvent)
  }

  private handleOpen = (): void => {
    this.attempt = 0
    this.setState("open")
    // Drain the buffer.
    if (this.queue.length > 0 && this.socket) {
      for (const m of this.queue) {
        try {
          this.socket.send(m)
        } catch {
          // drop
        }
      }
      this.queue = []
    }
  }

  private handleMessage = (event: MessageEvent): void => {
    // We only handle text frames. Binary
    // payloads (Blob / ArrayBuffer) are not
    // used by the V4 ingestion channel.
    if (typeof event.data === "string") {
      this.opts.onMessage?.(event.data)
    }
  }

  private handleError = (event: Event): void => {
    this.opts.onError?.(event)
    // The `error` event is always followed by
    // a `close` event per the HTML spec, so we
    // do the reconnect from `handleCloseEvent`.
  }

  private handleCloseEvent = (event: CloseEvent): void => {
    if (this.closedByUser) {
      this.setState("closed")
      return
    }
    // Unexpected close: schedule a reconnect.
    // We don't gate on the close code — 1006
    // (abnormal) is the common case and the
    // backoff loop absorbs it.
    void event // referenced for debugging
    this.handleClose()
  }

  private handleClose(): void {
    this.setState("closed")
    this.socket = null
    if (this.closedByUser) return
    this.scheduleReconnect()
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    const delay = nextReconnectDelay(this.attempt, this.opts)
    this.attempt += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.openSocket()
    }, delay)
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.attempt = 0
  }

  private setState(next: WebSocketState): void {
    if (this.state === next) return
    this.state = next
    this.opts.onStateChange?.(next)
  }
}
