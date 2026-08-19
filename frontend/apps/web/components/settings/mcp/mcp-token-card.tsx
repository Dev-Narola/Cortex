/**
 * McpTokenCard — the "Generate MCP Token" surface.
 *
 * **F7 Part 3 (Tasks 8, 10, 11, 12, 13, 14, 15, 16,
 * 17, 22, 24, 27).** The token section of the MCP
 * page.
 *
 * **Backend contract — important.** The actual
 * backend (verified against
 * `Cortex/src/mcp/application/authentication.py`)
 * has NO dedicated MCP token endpoint. The MCP
 * server authenticates with either an API key
 * (via the `X-API-Key` header) or a JWT. The
 * "MCP token" the spec wants is just a regular
 * API key used for MCP.
 *
 * So this card drives the existing
 * `createApiKey` service from F7 Part 2 — the
 * resulting key is then used as the
 * `X-API-Key` header by the user's MCP client.
 * The one-time-reveal UX is identical to the API
 * Keys tab; we reuse the F7 Part 2
 * `GenerateApiKeyModal` + `ApiKeyReveal`
 * unchanged. No new secret-handling code.
 *
 * **Permission model.** The "Generate MCP Token"
 * button uses the existing `require_admin` guard
 * (verified against
 * `Cortex/src/identity/interface/rest/routes.py`):
 *   - owner + admin → button visible
 *   - member + viewer → button hidden
 *
 * **No token list / metadata.** Because the
 * "MCP token" is just a regular API key, the
 * token *list* lives in the API Keys tab. The
 * MCP page does NOT show a list of MCP tokens —
 * that would be misleading (it would just be a
 * subset of the API Keys list).
 *
 * **What the card shows.**
 *   - A "Generate MCP Token" button (top-right of
 *     the card, mirroring the F7 P2
 *     "Generate New Key" convention).
 *   - A one-line explainer of what the token
 *     does + how to use it.
 *   - The Generate modal (reused from F7 P2).
 *   - The reveal modal (reused from F7 P2) when
 *     the create mutation succeeds.
 */
"use client"

import { useCallback, useState } from "react"

import { Button, Card, CardContent, Icon } from "@cortex/ui"

import { ApiKeyReveal, GenerateApiKeyModal } from "@/components/settings/api-keys"
import { useAuthStore } from "@/lib/auth/store"
import type { ApiKeyCreated } from "@/services/api-keys"

/**
 * Roles that can generate API keys (and
 * therefore "MCP tokens"). Mirrors the
 * backend's `require_admin` guard. The MCP
 * page uses the same matrix as the API Keys
 * page — the operations are identical, only
 * the intent differs.
 */
const ADMIN_ROLES: ReadonlyArray<string> = ["owner", "admin"] as const

function canMutate(role: string | undefined): boolean {
  if (!role) return false
  return ADMIN_ROLES.includes(role)
}

/**
 * Default name for the API key we create
 * for MCP use. The user can override this
 * in the modal. The naming convention
 * `MCP — <client>` makes the key easy to
 * identify in the API Keys list later.
 */
const DEFAULT_NAME = "MCP integration"

export function McpTokenCard() {
  const currentUser = useAuthStore((s) => s.user)
  const userIsAdmin = canMutate(currentUser?.role)

  const [generateOpen, setGenerateOpen] = useState(false)
  // The one-time raw key lives here, and only
  // here — same lifecycle as the API Keys tab.
  // Closing the reveal drops the key from
  // memory.
  const [revealedKey, setRevealedKey] = useState<ApiKeyCreated | null>(null)

  const openGenerate = useCallback(() => setGenerateOpen(true), [])

  const handleCreated = useCallback((created: ApiKeyCreated) => {
    setGenerateOpen(false)
    setRevealedKey(created)
  }, [])

  const closeReveal = useCallback(() => {
    // The one-time boundary. The raw key is
    // gone the instant this fires.
    setRevealedKey(null)
  }, [])

  return (
    <>
      <Card data-testid="mcp-token-card">
        <CardContent className="space-y-3 p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-base font-semibold tracking-tight">
                MCP Authentication
              </h2>
              <p className="text-sm text-paper-200/70">
                Generate an API key for use with MCP-compatible clients. The key is shown once at
                creation and stored as a hash on the server.
              </p>
            </div>
            {userIsAdmin ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={openGenerate}
                data-testid="mcp-generate-button"
              >
                <Icon name="KeyRound" className="h-3.5 w-3.5" />
                <span>Generate MCP Token</span>
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-paper-200/50">
            All API keys you generate are listed under{" "}
            <a
              href="/app/settings/api-keys"
              className="text-volt-400 underline-offset-2 hover:underline"
              data-testid="mcp-api-keys-link"
            >
              Settings → API Keys
            </a>
            . The MCP tab intentionally does not maintain a separate list — the key you generate
            here is the same kind of object.
          </p>
        </CardContent>
      </Card>

      <GenerateApiKeyModal
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        onCreated={handleCreated}
      />

      <ApiKeyReveal open={revealedKey !== null} created={revealedKey} onClose={closeReveal} />
    </>
  )
}

/**
 * **Why a thin wrapper around the F7 P2
 * components.** The F7 Part 2 modal + reveal
 * are the canonical "generate + reveal an
 * API key" surfaces. The MCP page's only
 * differentiator is the *intent* (the key
 * is used for MCP) and the *name default*
 * (we open the modal with "MCP integration"
 * pre-filled). The one-time secret handling
 * is the same — we don't want two
 * implementations of the same UX.
 */
export { DEFAULT_NAME as MCP_DEFAULT_TOKEN_NAME }
