/**
 * Audit Log — types.
 *
 * **F7 Part 5.** Narrow UI mapping for the
 * tenant-scoped audit data the Settings page
 * consumes.
 *
 * **Verified contract.** All shapes mirror
 * the actual backend response (verified
 * against
 * `Cortex/src/observability/interface/rest/audit_routes.py`).
 * We do NOT invent fields the backend doesn't
 * return (per the F7 Part 5 spec: "Follow the
 * actual response contract").
 *
 * **One endpoint, one envelope.** The backend
 * returns:
 *
 *   {
 *     items:      AuditEvent[],
 *     next_cursor: string | null,   // base64
 *   }
 *
 * **What the UI does NOT display.** Even
 * though the backend returns
 * `actor_user_id`, `actor_api_key_id`,
 * `metadata`, and `ip_address`, the UI
 * intentionally surfaces only safe fields
 * (per the F7 Part 5 spec: "Do not blindly
 * render every backend field. ... Never
 * display raw IP address, internal metadata,
 * authentication credentials, tokens").
 * The row + detail show the action + the
 * resource + the timestamp + the actor kind
 * (User / API key / System). The raw
 * `ip_address` is fetched on detail-expand
 * only, and `metadata` is rendered as a
 * filtered subset (no PII / no token-like
 * fields).
 */

/**
 * A single audit event returned by
 * `GET /api/v1/audit-log`.
 *
 * Mirrors the backend's `AuditEventSchema`
 * (verified against
 * `Cortex/src/observability/interface/rest/audit_routes.py:46-56`).
 */
export interface AuditEvent {
  id: string
  /** The tenant that owns the event — the
   *  UI never displays this (the user is
   *  already in their tenant context). */
  tenant_id: string
  action: string
  actor_user_id: string | null
  actor_api_key_id: string | null
  resource_type: string | null
  resource_id: string | null
  metadata: Record<string, unknown>
  ip_address: string | null
  created_at: string
}

/**
 * The paginated response envelope returned
 * by `GET /api/v1/audit-log`.
 *
 * Mirrors the backend's `AuditEventListResponse`
 * (verified against
 * `Cortex/src/observability/interface/rest/audit_routes.py:59-61`).
 */
export interface AuditEventListResponse {
  items: ReadonlyArray<AuditEvent>
  /** Opaque base64 keyset cursor for the
   *  next page. `null` means there are no
   *  more events. */
  next_cursor: string | null
}

/**
 * The closed set of actions the backend's
 * `AuditAction` enum records (verified
 * against
 * `Cortex/src/observability/domain/entities.py:29-63`).
 *
 * The UI surfaces an "Unknown" label for
 * any action the backend adds in the future
 * — the screen must never crash on a new
 * value.
 */
export const AUDIT_ACTIONS = {
  // Document lifecycle
  DOCUMENT_CREATED: "document_created",
  DOCUMENT_ACCESSED: "document_accessed",
  DOCUMENT_DELETED: "document_deleted",
  DOCUMENT_INGESTION_STARTED: "document_ingestion_started",
  DOCUMENT_INGESTION_COMPLETED: "document_ingestion_completed",
  DOCUMENT_INGESTION_FAILED: "document_ingestion_failed",
  // API keys
  API_KEY_CREATED: "api_key_created",
  API_KEY_REVOKED: "api_key_revoked",
  // Tenant / user / RBAC
  TENANT_UPDATED: "tenant_updated",
  TENANT_CREATED: "tenant_created",
  USER_UPDATED: "user_updated",
  USER_INVITED: "user_invited",
  USER_REMOVED: "user_removed",
  ROLE_CHANGED: "role_changed",
  // Conversation
  CONVERSATION_CREATED: "conversation_created",
  CONVERSATION_ACCESSED: "conversation_accessed",
  CONVERSATION_RENAMED: "conversation_renamed",
  CONVERSATION_DELETED: "conversation_deleted",
  // Auth
  LOGIN_SUCCESS: "login_success",
  LOGIN_FAILURE: "login_failure",
  LOGOUT: "logout",
} as const

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS]

/**
 * The closed set of resource types the
 * backend's `audit_log` CHECK constraint
 * permits (verified against
 * `Cortex/src/observability/domain/entities.py:71-83`).
 */
export const AUDIT_RESOURCE_TYPES = {
  DOCUMENT: "document",
  CHUNK: "chunk",
  API_KEY: "api_key",
  TENANT: "tenant",
  USER: "user",
  ROLE: "role",
  CONVERSATION: "conversation",
  MESSAGE: "message",
  SESSION: "session",
} as const

export type AuditResourceType =
  (typeof AUDIT_RESOURCE_TYPES)[keyof typeof AUDIT_RESOURCE_TYPES]

/**
 * Human-readable label for an action.
 *
 * The mapping is a presentation concern —
 * the backend's enum is stable, the UI's
 * label is whatever the product team chooses.
 * The mapping is a pure presentation swap;
 * the backend's event name is preserved
 * internally (e.g. for filter dropdowns).
 */
export function actionLabel(action: string): string {
  switch (action) {
    // Document lifecycle
    case AUDIT_ACTIONS.DOCUMENT_CREATED:
      return "Document created"
    case AUDIT_ACTIONS.DOCUMENT_ACCESSED:
      return "Document accessed"
    case AUDIT_ACTIONS.DOCUMENT_DELETED:
      return "Document deleted"
    case AUDIT_ACTIONS.DOCUMENT_INGESTION_STARTED:
      return "Document ingestion started"
    case AUDIT_ACTIONS.DOCUMENT_INGESTION_COMPLETED:
      return "Document ingestion completed"
    case AUDIT_ACTIONS.DOCUMENT_INGESTION_FAILED:
      return "Document ingestion failed"
    // API keys
    case AUDIT_ACTIONS.API_KEY_CREATED:
      return "API key created"
    case AUDIT_ACTIONS.API_KEY_REVOKED:
      return "API key revoked"
    // Tenant / user / RBAC
    case AUDIT_ACTIONS.TENANT_UPDATED:
      return "Tenant updated"
    case AUDIT_ACTIONS.TENANT_CREATED:
      return "Tenant created"
    case AUDIT_ACTIONS.USER_UPDATED:
      return "User updated"
    case AUDIT_ACTIONS.USER_INVITED:
      return "User invited"
    case AUDIT_ACTIONS.USER_REMOVED:
      return "User removed"
    case AUDIT_ACTIONS.ROLE_CHANGED:
      return "Role changed"
    // Conversation
    case AUDIT_ACTIONS.CONVERSATION_CREATED:
      return "Conversation created"
    case AUDIT_ACTIONS.CONVERSATION_ACCESSED:
      return "Conversation accessed"
    case AUDIT_ACTIONS.CONVERSATION_RENAMED:
      return "Conversation renamed"
    case AUDIT_ACTIONS.CONVERSATION_DELETED:
      return "Conversation deleted"
    // Auth
    case AUDIT_ACTIONS.LOGIN_SUCCESS:
      return "Login succeeded"
    case AUDIT_ACTIONS.LOGIN_FAILURE:
      return "Login failed"
    case AUDIT_ACTIONS.LOGOUT:
      return "Logged out"
    default:
      // Defensive: the backend may add new
      // actions in the future. We render
      // the raw enum value rather than
      // crash (the test suite pins this
      // behaviour).
      return action
  }
}

/**
 * Coarse action category — used by the
 * filter dropdown to group related actions.
 * The category is a presentation concern;
 * the backend's enum is not modified.
 */
export type ActionCategory =
  | "documents"
  | "api_keys"
  | "users"
  | "tenant"
  | "conversations"
  | "auth"
  | "other"

export function actionCategory(action: string): ActionCategory {
  if (
    action === AUDIT_ACTIONS.DOCUMENT_CREATED ||
    action === AUDIT_ACTIONS.DOCUMENT_ACCESSED ||
    action === AUDIT_ACTIONS.DOCUMENT_DELETED ||
    action === AUDIT_ACTIONS.DOCUMENT_INGESTION_STARTED ||
    action === AUDIT_ACTIONS.DOCUMENT_INGESTION_COMPLETED ||
    action === AUDIT_ACTIONS.DOCUMENT_INGESTION_FAILED
  ) {
    return "documents"
  }
  if (
    action === AUDIT_ACTIONS.API_KEY_CREATED ||
    action === AUDIT_ACTIONS.API_KEY_REVOKED
  ) {
    return "api_keys"
  }
  if (
    action === AUDIT_ACTIONS.USER_UPDATED ||
    action === AUDIT_ACTIONS.USER_INVITED ||
    action === AUDIT_ACTIONS.USER_REMOVED ||
    action === AUDIT_ACTIONS.ROLE_CHANGED
  ) {
    return "users"
  }
  if (
    action === AUDIT_ACTIONS.TENANT_UPDATED ||
    action === AUDIT_ACTIONS.TENANT_CREATED
  ) {
    return "tenant"
  }
  if (
    action === AUDIT_ACTIONS.CONVERSATION_CREATED ||
    action === AUDIT_ACTIONS.CONVERSATION_ACCESSED ||
    action === AUDIT_ACTIONS.CONVERSATION_RENAMED ||
    action === AUDIT_ACTIONS.CONVERSATION_DELETED
  ) {
    return "conversations"
  }
  if (
    action === AUDIT_ACTIONS.LOGIN_SUCCESS ||
    action === AUDIT_ACTIONS.LOGIN_FAILURE ||
    action === AUDIT_ACTIONS.LOGOUT
  ) {
    return "auth"
  }
  return "other"
}

export function categoryLabel(category: ActionCategory): string {
  switch (category) {
    case "documents":
      return "Documents"
    case "api_keys":
      return "API keys"
    case "users":
      return "Users & roles"
    case "tenant":
      return "Tenant"
    case "conversations":
      return "Conversations"
    case "auth":
      return "Authentication"
    case "other":
      return "Other"
    default:
      return category
  }
}

/**
 * The actor kind — derived from which
 * `actor_*` field is set. The UI uses this
 * to label a row's actor column without
 * revealing the raw UUID.
 */
export type ActorKind = "user" | "api_key" | "system"

export function actorKind(event: Pick<AuditEvent, "actor_user_id" | "actor_api_key_id">): ActorKind {
  if (event.actor_user_id) return "user"
  if (event.actor_api_key_id) return "api_key"
  return "system"
}

/**
 * Human-readable resource label. The
 * backend returns raw UUIDs for
 * `resource_id`; the UI shows a shortened
 * version (first 8 chars). The
 * `resource_type` is humanised.
 */
export function resourceTypeLabel(resourceType: string | null): string {
  if (!resourceType) return "—"
  switch (resourceType) {
    case AUDIT_RESOURCE_TYPES.DOCUMENT:
      return "Document"
    case AUDIT_RESOURCE_TYPES.CHUNK:
      return "Chunk"
    case AUDIT_RESOURCE_TYPES.API_KEY:
      return "API key"
    case AUDIT_RESOURCE_TYPES.TENANT:
      return "Tenant"
    case AUDIT_RESOURCE_TYPES.USER:
      return "User"
    case AUDIT_RESOURCE_TYPES.ROLE:
      return "Role"
    case AUDIT_RESOURCE_TYPES.CONVERSATION:
      return "Conversation"
    case AUDIT_RESOURCE_TYPES.MESSAGE:
      return "Message"
    case AUDIT_RESOURCE_TYPES.SESSION:
      return "Session"
    default:
      return resourceType
  }
}

export function shortResourceId(resourceId: string | null): string {
  if (!resourceId) return "—"
  if (resourceId.length <= 12) return resourceId
  return `${resourceId.slice(0, 8)}…`
}
