/**
 * API Keys — types.
 *
 * **F7 Part 2 (Tasks 1, 15).** Narrow UI mapping for
 * the API-key data the Settings page consumes.
 *
 * **Why hand-rolled (not a generated type).** Mirrors
 * the F0–F6 pattern (`services/team/types.ts`,
 * `services/agents/types.ts`, etc.) — a focused
 * UI-facing shape that doesn't have to track every
 * backend field. The team service follows the same
 * approach.
 *
 * **`key_hash` is never modelled.** The backend's
 * `ApiKeyResponse` deliberately omits `key_hash` (the
 * field exists in the database but is never returned
 * over the wire). The `ApiKey` type below doesn't even
 * reference the concept — there's no way for a
 * frontend consumer to accidentally render it.
 *
 * **`raw_key` lives only in `ApiKeyCreatedResponse`.**
 * Per the database design, the raw key is shown
 * exactly once at creation and is never recoverable
 * after the response is delivered. The frontend keeps
 * it in transient UI state (the reveal modal's
 * `useState`) and never persists it.
 *
 * **Status.** Derived client-side from `revoked_at`:
 *   - `revoked_at === null` → `active`
 *   - `revoked_at !== null` → `revoked`
 *
 * No separate "status" field is modelled — the
 * backend's `revoked_at` is the source of truth.
 *
 * **Masked key.** The backend does not return a
 * masked key prefix in the list response. The
 * `displayKey()` helper in the panel produces a
 * stable JetBrains-Mono visual (`cx_•••• ••••`)
 * derived from the key id so the user can scan
 * the list at a glance.
 */

export type ApiKeyStatus = "active" | "revoked"

/**
 * A single API key as returned by `GET /api-keys`
 * and `DELETE /api-keys/{id}`.
 */
export interface ApiKey {
  /** Backend UUID. The primary key for the
   *  revoke mutation. */
  id: string
  /** Tenant UUID. Never used for routing — the
   *  backend enforces tenant scope at the SQL
   *  level. */
  tenant_id: string
  /** User-supplied friendly name (e.g.
   *  "CI Pipeline"). */
  name: string
  /** Scopes the key is granted. The list may
   *  be empty (the default for new keys). */
  scopes: ReadonlyArray<string>
  /** ISO timestamp of the last successful
   *  authentication, or `null` if the key has
   *  never been used. */
  last_used_at: string | null
  /** ISO timestamp of revocation, or `null`
   *  if the key is still active. */
  revoked_at: string | null
  /** ISO timestamp of creation. */
  created_at: string
}

/**
 * Response for `POST /api-keys` (creation only).
 *
 * The `raw_key` is the one-time secret the user
 * must copy before closing the reveal modal.
 * It is NEVER returned by `GET /api-keys` or
 * `DELETE /api-keys/{id}`.
 */
export interface ApiKeyCreated extends ApiKey {
  /** The one-time plaintext key. Visible to
   *  the user exactly once. Never persisted
   *  client-side. */
  raw_key: string
}

/**
 * Body for the create mutation.
 *
 * `scopes` defaults to `[]` on the backend. Part 2
 * doesn't surface the scope picker (the spec is
 * explicit: generate, name, submit). A future
 * F7-Part 2 hardening pass can add the picker.
 */
export interface CreateApiKeyRequest {
  name: string
  scopes?: ReadonlyArray<string>
}

/**
 * List envelope. Mirrors the `GET /api-keys`
 * shape — the backend returns the array directly
 * (not a `{ items, total, ... }` envelope), so the
 * response type is the array itself.
 */
export type ApiKeyList = ReadonlyArray<ApiKey>

/**
 * Derive the user-facing status from a key row.
 *
 * The backend's `revoked_at` is the single source
 * of truth: a non-null timestamp means the key
 * has been revoked (and the UI must NOT offer a
 * second revoke action).
 */
export function statusOf(key: Pick<ApiKey, "revoked_at">): ApiKeyStatus {
  return key.revoked_at === null ? "active" : "revoked"
}
