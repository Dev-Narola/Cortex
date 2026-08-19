/**
 * audit-log types — F7 Part 5.
 *
 * Tests the small presentation helpers in
 * `services/audit/types.ts`:
 *   - `actionLabel()` — humanised action
 *     labels for every documented action.
 *   - `actionCategory()` — coarse grouping
 *     for the row badge.
 *   - `categoryLabel()` — friendly category
 *     label.
 *   - `actorKind()` — User / API key / System
 *     derivation.
 *   - `resourceTypeLabel()` — friendly
 *     resource-type label.
 *   - `shortResourceId()` — short-prefix
 *     fallback when no human name is
 *     available.
 *
 * **Defensive default.** The backend's
 * `AuditAction` enum may grow. The screen
 * must never crash on a new value — it
 * renders the raw enum. This file pins
 * that behaviour.
 */

import { describe, expect, it } from "vitest"

import {
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
  actionCategory,
  actionLabel,
  actorKind,
  categoryLabel,
  resourceTypeLabel,
  shortResourceId,
} from "@/services/audit"

describe("actionLabel", () => {
  it("maps every documented action to a friendly label", () => {
    expect(actionLabel(AUDIT_ACTIONS.DOCUMENT_CREATED)).toBe("Document created")
    expect(actionLabel(AUDIT_ACTIONS.DOCUMENT_ACCESSED)).toBe("Document accessed")
    expect(actionLabel(AUDIT_ACTIONS.DOCUMENT_DELETED)).toBe("Document deleted")
    expect(actionLabel(AUDIT_ACTIONS.API_KEY_CREATED)).toBe("API key created")
    expect(actionLabel(AUDIT_ACTIONS.API_KEY_REVOKED)).toBe("API key revoked")
    expect(actionLabel(AUDIT_ACTIONS.TENANT_UPDATED)).toBe("Tenant updated")
    expect(actionLabel(AUDIT_ACTIONS.ROLE_CHANGED)).toBe("Role changed")
    expect(actionLabel(AUDIT_ACTIONS.LOGIN_SUCCESS)).toBe("Login succeeded")
    expect(actionLabel(AUDIT_ACTIONS.LOGIN_FAILURE)).toBe("Login failed")
  })

  it("falls back to the raw enum for unknown actions", () => {
    expect(actionLabel("future_action")).toBe("future_action")
    expect(actionLabel("")).toBe("")
  })
})

describe("actionCategory", () => {
  it("groups document actions under 'documents'", () => {
    expect(actionCategory(AUDIT_ACTIONS.DOCUMENT_CREATED)).toBe("documents")
    expect(actionCategory(AUDIT_ACTIONS.DOCUMENT_ACCESSED)).toBe("documents")
    expect(actionCategory(AUDIT_ACTIONS.DOCUMENT_DELETED)).toBe("documents")
  })

  it("groups api-key actions under 'api_keys'", () => {
    expect(actionCategory(AUDIT_ACTIONS.API_KEY_CREATED)).toBe("api_keys")
    expect(actionCategory(AUDIT_ACTIONS.API_KEY_REVOKED)).toBe("api_keys")
  })

  it("groups auth actions under 'auth'", () => {
    expect(actionCategory(AUDIT_ACTIONS.LOGIN_SUCCESS)).toBe("auth")
    expect(actionCategory(AUDIT_ACTIONS.LOGIN_FAILURE)).toBe("auth")
    expect(actionCategory(AUDIT_ACTIONS.LOGOUT)).toBe("auth")
  })

  it("groups unknown actions under 'other'", () => {
    expect(actionCategory("not_a_real_action")).toBe("other")
  })
})

describe("categoryLabel", () => {
  it("returns a friendly label for every category", () => {
    expect(categoryLabel("documents")).toBe("Documents")
    expect(categoryLabel("api_keys")).toBe("API keys")
    expect(categoryLabel("users")).toBe("Users & roles")
    expect(categoryLabel("tenant")).toBe("Tenant")
    expect(categoryLabel("conversations")).toBe("Conversations")
    expect(categoryLabel("auth")).toBe("Authentication")
    expect(categoryLabel("other")).toBe("Other")
  })
})

describe("actorKind", () => {
  it("returns 'user' when actor_user_id is set", () => {
    expect(
      actorKind({ actor_user_id: "u-1", actor_api_key_id: null }),
    ).toBe("user")
  })
  it("returns 'api_key' when only actor_api_key_id is set", () => {
    expect(
      actorKind({ actor_user_id: null, actor_api_key_id: "k-1" }),
    ).toBe("api_key")
  })
  it("returns 'system' when neither is set", () => {
    expect(actorKind({ actor_user_id: null, actor_api_key_id: null })).toBe("system")
  })
  it("prefers 'user' when both are set (defensive)", () => {
    expect(
      actorKind({ actor_user_id: "u-1", actor_api_key_id: "k-1" }),
    ).toBe("user")
  })
})

describe("resourceTypeLabel", () => {
  it("returns a friendly label for every resource type", () => {
    expect(resourceTypeLabel(AUDIT_RESOURCE_TYPES.DOCUMENT)).toBe("Document")
    expect(resourceTypeLabel(AUDIT_RESOURCE_TYPES.API_KEY)).toBe("API key")
    expect(resourceTypeLabel(AUDIT_RESOURCE_TYPES.TENANT)).toBe("Tenant")
    expect(resourceTypeLabel(AUDIT_RESOURCE_TYPES.CONVERSATION)).toBe("Conversation")
  })
  it("returns the raw enum for unknown resource types", () => {
    expect(resourceTypeLabel("not_a_real_resource")).toBe("not_a_real_resource")
  })
  it("returns em-dash for null", () => {
    expect(resourceTypeLabel(null)).toBe("—")
  })
})

describe("shortResourceId", () => {
  it("returns em-dash for null", () => {
    expect(shortResourceId(null)).toBe("—")
  })
  it("returns the raw id when short enough", () => {
    expect(shortResourceId("abc")).toBe("abc")
    expect(shortResourceId("abcdefghijkl")).toBe("abcdefghijkl")
  })
  it("truncates long ids to 8 chars + ellipsis", () => {
    expect(shortResourceId("abcdefghijklmnop")).toBe("abcdefgh…")
  })
})
