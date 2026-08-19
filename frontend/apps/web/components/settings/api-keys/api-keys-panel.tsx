/**
 * ApiKeysPanel — the Settings → API Keys screen.
 *
 * **F7 Part 2 (Tasks 4, 12, 13, 14, 15, 22, 23, 24,
 * 25, 27, 28, 29, 30, 31, 32, 33).** The composition
 * root for the API Keys tab. It owns:
 *   - the panel header (title + Generate New Key
 *     top-right per the spec's primary-action
 *     convention)
 *   - the key list (table or empty state)
 *   - the loading / error / retry path
 *   - the generate modal (open / close)
 *   - the **one-time reveal modal** that holds
 *     the raw key in transient state
 *   - the revoke confirm dialog
 *   - the permission-aware generate + revoke
 *     actions
 *
 * **One-time secret lifecycle.** This component
 * is the **only** place in the app that holds the
 * raw API key outside the network response. The
 * `revealedKey` (a `useState`) holds the
 * `ApiKeyCreated` returned by the create
 * mutation. When the user closes the reveal
 * (or navigates away), the state is cleared.
 * The raw key never enters:
 *   - TanStack Query cache (the `useCreateApiKey`
 *     mutation does not write `raw_key` to the
 *     query cache)
 *   - localStorage / sessionStorage
 *   - URL / route params
 *   - persistent Zustand stores
 *
 * **Permission model.** Per the backend's
 * `require_admin` guard (verified against
 * `Cortex/src/identity/interface/rest/routes.py`):
 *   - `owner` + `admin` → can generate AND
 *     revoke. The Generate button is visible;
 *     the Revoke menu is visible on every active
 *     row.
 *   - `member` + `viewer` → can list (the
 *     backend's `require_member` guard allows
 *     reads). The Generate button is hidden and
 *     the Revoke menu is hidden.
 *
 * The UI gate is a UX layer; the backend is the
 * source of truth. A non-admin caller would get
 * a 403 from a direct API call regardless of
 * what the UI does.
 */
"use client"

import { useCallback, useState } from "react"

import {
  Button,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  Icon,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@cortex/ui"

import { useApiKeys, useRevokeApiKey } from "@/hooks/api-keys"
import { useAuthStore } from "@/lib/auth/store"
import type { ApiKey, ApiKeyCreated } from "@/services/api-keys"

import { ApiKeyReveal } from "./api-key-reveal"
import { ApiKeyRow } from "./api-key-row"
import { GenerateApiKeyModal } from "./generate-api-key-modal"
import { RevokeApiKeyConfirm } from "./revoke-api-key-confirm"

/**
 * Roles that can mutate API keys. Mirrors the
 * backend's `require_admin` dependency. The list
 * endpoint uses `require_member` (any role), so
 * the list is always rendered.
 */
const ADMIN_ROLES: ReadonlyArray<string> = ["owner", "admin"] as const

function canMutate(role: string | undefined): boolean {
  if (!role) return false
  return ADMIN_ROLES.includes(role)
}

export function ApiKeysPanel() {
  const currentUser = useAuthStore((s) => s.user)
  const userIsAdmin = canMutate(currentUser?.role)

  const { data, isLoading, isError, error, refetch } = useApiKeys()
  const revokeMutation = useRevokeApiKey()
  const [generateOpen, setGenerateOpen] = useState(false)
  // The one-time raw key lives here, and only
  // here. When the reveal closes, the parent
  // sets this to `null` and the raw key is
  // dropped from memory.
  const [revealedKey, setRevealedKey] = useState<ApiKeyCreated | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null)
  // The confirm dialog's local error surface —
  // mutation errors land here (and are cleared
  // by the user via "Dismiss" or a fresh
  // open).
  const [revokeError, setRevokeError] = useState<string | null>(null)

  const openGenerate = useCallback(() => setGenerateOpen(true), [])

  const handleCreated = useCallback((created: ApiKeyCreated) => {
    // Close the generate modal + open the
    // reveal with the raw key. The raw key
    // lives in `revealedKey` only as long as
    // the reveal is open.
    setGenerateOpen(false)
    setRevealedKey(created)
  }, [])

  const closeReveal = useCallback(() => {
    // The one-time boundary. The raw key is
    // gone the instant this fires.
    setRevealedKey(null)
  }, [])

  const requestRevoke = useCallback((apiKey: ApiKey) => {
    setRevokeError(null)
    setRevokeTarget(apiKey)
  }, [])

  const closeRevoke = useCallback(() => {
    if (revokeMutation.isPending) return
    setRevokeTarget(null)
    setRevokeError(null)
  }, [revokeMutation.isPending])

  const handleConfirmRevoke = useCallback(async () => {
    if (!revokeTarget) return
    setRevokeError(null)
    try {
      await revokeMutation.mutateAsync({ id: revokeTarget.id })
      setRevokeTarget(null)
    } catch (err) {
      setRevokeError(
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message ?? "Failed to revoke the API key.")
          : "Failed to revoke the API key.",
      )
    }
  }, [revokeTarget, revokeMutation])

  const keys = data ?? []

  return (
    <Card data-testid="api-keys-panel">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-base font-semibold tracking-tight">API Keys</h2>
            <p className="text-sm text-paper-200/70">
              Create and revoke API keys for connecting external tools to your Cortex workspace. The
              full key is shown exactly once at creation.
            </p>
          </div>
          {userIsAdmin ? (
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={openGenerate}
              data-testid="api-keys-generate-button"
            >
              <Icon name="KeyRound" className="h-3.5 w-3.5" />
              <span>Generate New Key</span>
            </Button>
          ) : null}
        </div>

        {isLoading ? <ApiKeysPanelSkeleton /> : null}

        {!isLoading && isError ? (
          <ErrorState
            title="Unable to load API keys"
            description="We couldn't reach the API-keys service. Check your connection and try again."
            retryLabel="Retry"
            onRetry={() => {
              void refetch()
            }}
            code={
              error && "status" in error
                ? String((error as { status?: number }).status ?? "")
                : undefined
            }
          />
        ) : null}

        {!isLoading && !isError ? (
          keys.length === 0 ? (
            <ApiKeysPanelEmpty canGenerate={userIsAdmin} onGenerate={openGenerate} />
          ) : (
            <ApiKeyList
              keys={keys}
              canRevoke={userIsAdmin}
              confirmingKeyId={revokeTarget?.id ?? null}
              onRequestRevoke={requestRevoke}
            />
          )
        ) : null}

        {revokeError ? (
          <div
            role="alert"
            data-testid="api-keys-revoke-error"
            className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <div className="flex items-center justify-between gap-3">
              <span>{revokeError}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setRevokeError(null)}
                className="text-destructive"
                data-testid="api-keys-revoke-error-dismiss"
              >
                Dismiss
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>

      <GenerateApiKeyModal
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        onCreated={handleCreated}
      />

      <ApiKeyReveal open={revealedKey !== null} created={revealedKey} onClose={closeReveal} />

      <RevokeApiKeyConfirm
        open={revokeTarget !== null}
        onOpenChange={(next) => {
          if (!next) closeRevoke()
        }}
        keyName={revokeTarget?.name ?? null}
        pending={revokeMutation.isPending}
        onConfirm={handleConfirmRevoke}
      />
    </Card>
  )
}

function ApiKeysPanelSkeleton() {
  return (
    <output
      data-testid="api-keys-panel-skeleton"
      className="block space-y-2"
      aria-label="Loading API keys"
    >
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </output>
  )
}

function ApiKeysPanelEmpty({
  canGenerate,
  onGenerate,
}: {
  canGenerate: boolean
  onGenerate: () => void
}) {
  return (
    <EmptyState
      icon="KeyRound"
      title="No API keys yet"
      description="Create an API key to connect external tools and services to Cortex."
      actionLabel={canGenerate ? "Generate New Key" : undefined}
      onAction={canGenerate ? onGenerate : undefined}
      data-testid="api-keys-panel-empty"
    />
  )
}

function ApiKeyList({
  keys,
  canRevoke,
  confirmingKeyId,
  onRequestRevoke,
}: {
  keys: ReadonlyArray<ApiKey>
  canRevoke: boolean
  confirmingKeyId: string | null
  onRequestRevoke: (apiKey: ApiKey) => void
}) {
  return (
    <Table data-testid="api-keys-table">
      <TableHeader>
        <TableRow>
          <TableCell tag="th">Name</TableCell>
          <TableCell tag="th">Key</TableCell>
          <TableCell tag="th">Created</TableCell>
          <TableCell tag="th">Last Used</TableCell>
          <TableCell tag="th">Status</TableCell>
          <TableCell tag="th" align="right">
            <span className="sr-only">Actions</span>
          </TableCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {keys.map((apiKey) => (
          <ApiKeyRow
            key={apiKey.id}
            apiKey={apiKey}
            canRevoke={canRevoke}
            confirmingRevoke={confirmingKeyId === apiKey.id}
            onRequestRevoke={onRequestRevoke}
          />
        ))}
      </TableBody>
    </Table>
  )
}
