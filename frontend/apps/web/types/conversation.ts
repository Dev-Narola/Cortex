/**
 * Conversation types — the canonical frontend shape
 * of a Conversation + Message, mirroring the V4 backend
 * contract.
 *
 * **F4 Part 1 (Task 3).** The backend's `MessageSchema`
 * exposes:
 *   - `id`, `conversation_id`, `role` (string), `content`
 *   - `token_count` (not a full token_usage object)
 *   - `retrieved_chunk_ids` (the seeds for the future
 *     citation panel — Part 3)
 *   - `model_name` (the LLM used for the assistant turn)
 *   - `created_at`
 *
 * The F4 spec described a richer `token_usage` block.
 * The V4 backend doesn't expose that — `token_count` is
 * the closest available signal. We mirror the actual
 * backend shape so the api-client's generated types
 * stay the single source of truth.
 *
 * **`role` is a string union.** The backend's Pydantic
 * schema stores it as `str`; the domain entity has a
 * `MessageRole` enum. We narrow on the frontend to
 * `user | assistant | tool` (per the F4 spec) and
 * keep `string` as a fallback for forward-compat
 * (the backend may add a new role before the
 * frontend picks it up).
 *
 * **Citation fields live on Message for Part 1, but are
 * not surfaced yet.** The Part 1 type model reserves
 * the field so the future Part 3 `CitationPanel` can
 * read it without a model migration.
 */

export type MessageRole = "user" | "assistant" | "tool"

export interface Message {
  id: string
  conversationId: string
  role: MessageRole
  content: string
  /**
   * Backend `token_count`. Single integer; the F4
   * spec's richer `token_usage` block is on the
   * roadmap but not yet exposed by V4.
   */
  tokenCount: number
  /**
   * Document chunks the assistant used to ground the
   * answer. Surfaced in Part 3 (citations).
   */
  retrievedChunkIds: string[]
  /** LLM used to generate the assistant turn. */
  modelName: string | null
  createdAt: string
}

export interface Conversation {
  id: string
  tenantId: string
  userId: string
  title: string
  summary: string | null
  createdAt: string
  updatedAt: string
  /**
   * Present only on `GET /conversations/{id}`
   * (the `ConversationWithMessagesSchema`). The list
   * endpoint returns conversations without messages.
   */
  messages?: Message[]
}

/**
 * The list shape returned by `GET /conversations`.
 *
 * **F5 Part 1.** The backend's
 * `ConversationListResponse` is a paginated envelope:
 *
 * ```json
 * {
 *   "items": [...ConversationSchema],
 *   "total": 42,
 *   "limit": 50,
 *   "offset": 0
 * }
 * ```
 *
 * **Ordering.** The backend orders by `updated_at`
 * descending — the most recently active conversation
 * is first. The frontend does NOT re-order; we
 * trust the server's order so refresh + new
 * conversation always slot in at the same place.
 *
 * **Pagination.** Part 1 renders a flat list
 * (no paging controls yet). The envelope is still
 * the right shape because Part 2's archive +
 * search will need `total` + cursor support.
 */
export interface ConversationListResponse {
  items: Conversation[]
  total: number
  limit: number
  offset: number
}

export interface CreateConversationRequest {
  title: string
}

export interface CreateConversationResponse {
  id: string
  tenantId: string
  userId: string
  title: string
  summary: string | null
  createdAt: string
  updatedAt: string
}

/** Type guard for the role union. */
export function isMessageRole(value: unknown): value is MessageRole {
  return value === "user" || value === "assistant" || value === "tool"
}
