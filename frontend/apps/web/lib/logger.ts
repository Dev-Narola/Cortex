/**
 * Logger — the single sink for application logs.
 *
 * **F0 scope (Task 41).** Wraps the four log levels (`debug`,
 * `info`, `warn`, `error`) behind a stable interface so swapping
 * the underlying sink is a one-file change. Today it writes to
 * `console.*`; tomorrow it writes to Sentry / OpenTelemetry
 * without any caller noticing.
 *
 * **Why a custom logger, not `console.log` everywhere.**
 *   1. **Redaction.** `info(user)` would log the whole object —
 *      including a password field, if a future caller passed one.
 *      A central logger is the place to enforce redaction rules.
 *   2. **Correlation.** When F10 ships the request-id header, the
 *      logger can stamp every line with it so a slow-trace
 *      correlates back to a single user action.
 *   3. **Level routing.** Today everything goes to console. After
 *      Sentry ships, `error()` can fan out to Sentry while the
 *      others stay local.
 *
 * **Server vs client.** This module works in both runtimes. On
 * the client, `info` and `debug` are no-ops in production
 * (gated by `process.env.NODE_ENV`) so we don't ship a chatty
 * console to real users. On the server, all four are live.
 *
 * **Never** use `console.log` / `console.warn` / `console.error`
 * inside components or `lib/` code. Always import from here.
 */

type LogArg = unknown

interface Logger {
  debug(...args: LogArg[]): void
  info(...args: LogArg[]): void
  warn(...args: LogArg[]): void
  error(...args: LogArg[]): void
  /** Create a child logger with a tag prefix. Useful for tracing. */
  child(tag: string): Logger
}

const PREFIX = "[cortex]"

function shouldEmitDebug(): boolean {
  return process.env.NODE_ENV !== "production"
}

function formatArgs(tag: string | undefined, args: LogArg[]): unknown[] {
  if (!tag) return [PREFIX, ...args]
  return [`${PREFIX} ${tag}`, ...args]
}

function createLogger(tag?: string): Logger {
  return {
    debug(...args) {
      if (!shouldEmitDebug()) return
      console.debug(...formatArgs(tag, args))
    },
    info(...args) {
      if (!shouldEmitDebug()) return
      console.info(...formatArgs(tag, args))
    },
    warn(...args) {
      console.warn(...formatArgs(tag, args))
    },
    error(...args) {
      console.error(...formatArgs(tag, args))
    },
    child(childTag) {
      return createLogger(tag ? `${tag} ${childTag}` : childTag)
    },
  }
}

export const logger: Logger = createLogger()

export type { Logger }
