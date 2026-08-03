/**
 * HTTP error mapping.
 *
 * **F0 scope (Task 26).** The `ApiClient` throws a generic `ApiError`
 * (status + body). This module turns that into user-friendly
 * `FrontendError` instances with a stable shape components can
 * switch on, so the UI never has to do its own status-code math.
 *
 * Why map at all? Two reasons:
 *   1. **Translation.** A 401 from the backend is "Invalid email,
 *      password, or workspace" in the UI — the status code is
 *      internal, the message is what the user sees.
 *   2. **Categorisation.** A 422 has field-level errors that
 *      belong on a form input; a 500 is "try again later"; a
 *      429 is "wait N seconds". Components shouldn't have to
 *      figure that out from a status code.
 *
 * Adding a new status? Add a branch below + a `kind` to the
 * `FrontendErrorKind` union. The switch in `messageFor()` will
 * then force you to handle it.
 */

export type FrontendErrorKind =
  | "validation" // 400, 422 — fields the user can fix
  | "unauthorized" // 401 — auth failed
  | "forbidden" // 403 — auth ok, permission denied
  | "not_found" // 404
  | "rate_limited" // 429
  | "server" // 5xx
  | "network" // fetch threw (no response)
  | "unknown" // anything else

export interface FieldError {
  field: string
  message: string
}

export class FrontendError extends Error {
  public readonly kind: FrontendErrorKind
  public readonly status: number | null
  public readonly fields: ReadonlyArray<FieldError>
  public readonly retryAfterMs: number | null

  constructor(input: {
    kind: FrontendErrorKind
    message: string
    status?: number | null
    fields?: ReadonlyArray<FieldError>
    retryAfterMs?: number | null
  }) {
    super(input.message)
    this.name = "FrontendError"
    this.kind = input.kind
    this.status = input.status ?? null
    this.fields = input.fields ?? []
    this.retryAfterMs = input.retryAfterMs ?? null
  }
}

interface ApiErrorBody {
  code?: string
  message?: string
  detail?: string | Array<{ field: string; message: string }>
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null
  const seconds = Number.parseInt(value, 10)
  return Number.isFinite(seconds) ? seconds * 1000 : null
}

function fieldsFromBody(body: unknown): ReadonlyArray<FieldError> {
  if (!body || typeof body !== "object") return []
  const b = body as ApiErrorBody
  if (Array.isArray(b.detail)) {
    return b.detail
      .filter(
        (d): d is { field: string; message: string } =>
          typeof d?.field === "string" && typeof d?.message === "string",
      )
      .map((d) => ({ field: d.field, message: d.message }))
  }
  return []
}

export function mapToFrontendError(input: {
  status: number | null
  body: unknown
  retryAfterHeader: string | null
}): FrontendError {
  const { status, body, retryAfterHeader } = input
  const bodyMessage =
    body && typeof body === "object" && "message" in body
      ? String((body as ApiErrorBody).message ?? "")
      : ""
  const fields = fieldsFromBody(body)
  const retryAfterMs = parseRetryAfter(retryAfterHeader)

  if (status === null) {
    return new FrontendError({
      kind: "network",
      message: "Network error. Check your connection and try again.",
    })
  }

  if (status === 400 || status === 422) {
    return new FrontendError({
      kind: "validation",
      status,
      message: bodyMessage || "Please check the form fields and try again.",
      fields,
    })
  }
  if (status === 401) {
    return new FrontendError({
      kind: "unauthorized",
      status,
      message: bodyMessage || "Your session has expired. Please sign in again.",
    })
  }
  if (status === 403) {
    return new FrontendError({
      kind: "forbidden",
      status,
      message: bodyMessage || "You don't have permission to do that.",
    })
  }
  if (status === 404) {
    return new FrontendError({
      kind: "not_found",
      status,
      message: bodyMessage || "That resource was not found.",
    })
  }
  if (status === 429) {
    return new FrontendError({
      kind: "rate_limited",
      status,
      message: bodyMessage || "Too many requests. Please slow down.",
      retryAfterMs,
    })
  }
  if (status >= 500) {
    return new FrontendError({
      kind: "server",
      status,
      message: "The server hit an error. Please try again in a moment.",
    })
  }
  return new FrontendError({
    kind: "unknown",
    status,
    message: bodyMessage || "Something went wrong.",
  })
}

/**
 * Shortcut — turn a caught error from `ApiClient.request()` into
 * a `FrontendError`. If the error is already a `FrontendError`,
 * pass it through unchanged. If it's an `ApiError` (the runtime's
 * own error type), map it. Otherwise treat it as a network error.
 */
export function toFrontendError(err: unknown): FrontendError {
  if (err instanceof FrontendError) return err
  if (err && typeof err === "object" && "status" in err) {
    const e = err as { status: number; body: unknown; message?: string }
    return mapToFrontendError({
      status: e.status,
      body: e.body,
      retryAfterHeader: null,
    })
  }
  return new FrontendError({
    kind: "network",
    message: "Network error. Check your connection and try again.",
  })
}
