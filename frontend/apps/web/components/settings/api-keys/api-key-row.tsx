/**
 * ApiKeyRow — a single row in the API key list.
 *
 * **F7 Part 2 (Tasks 6, 9, 23, 26, 27).** Renders
 * the canonical 4-column row: Name, Key, Created,
 * Last Used, with a status badge and a revoke
 * action in the trailing column.
 *
 * **Masked key.** The backend's list response
 * doesn't return the raw key (by design — it's
 * shown only at creation). The row renders a
 * stable JetBrains-Mono placeholder derived from
 * the key id (`cx_•••• ••••`) so the list reads
 * at a glance. **The raw key never appears in the
 * list — not even after a successful create.** The
 * `useCreateApiKey` mutation invalidates the list
 * query, the new row arrives with no `raw_key` in
 * the response, and the masked representation
 * takes over.
 *
 * **Status badge.** Derived from `revoked_at`:
 *   - `null` → "Active" (success tone).
 *   - non-null → "Revoked" (muted tone).
 *
 * **Revoke action visibility.** The Revoke menu
 * is hidden when `canRevoke` is false (member /
 * viewer roles) AND for keys that are already
 * revoked. The spec is explicit: "For a revoked
 * key: Revoked rather than: Revoke again."
 */
"use client"

import { Badge, Button, Icon, TableCell, TableRow } from "@cortex/ui"

import type { ApiKey } from "@/services/api-keys"
import { statusOf } from "@/services/api-keys"

/**
 * Stable, deterministic masked representation
 * derived from the key id. The backend does not
 * return a masked prefix (the raw key is the
 * one-time secret and the list endpoint omits
 * it), so the UI synthesizes a placeholder. The
 * `cx_` prefix is the spec's example shape; the
 * `•••• ••••` body is the masked payload.
 *
 * The id is hashed into a 4-char fragment so the
 * visual is stable per key across re-renders.
 * We deliberately do NOT reconstruct any part
 * of the real key from the id — the id is the
 * database primary key, not the plaintext.
 */
function maskedKeyFor(id: string): string {
  // Cheap deterministic 4-char hash. Not
  // cryptographic — just visual stability.
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0
  }
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let out = ""
  for (let i = 0; i < 4; i++) {
    h = (h * 1103515245 + 12345) >>> 0
    out += alphabet[h % alphabet.length]
  }
  return `cx_${out} •••• ••••`
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Never"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "Never"
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export interface ApiKeyRowProps {
  apiKey: ApiKey
  /** Whether the current user can revoke keys
   *  (owner / admin only). */
  canRevoke: boolean
  /** Whether this specific row is the one whose
   *  revoke-confirm dialog is open. */
  confirmingRevoke: boolean
  /** Called when the user clicks "Revoke". The
   *  parent opens the confirm dialog. */
  onRequestRevoke: (apiKey: ApiKey) => void
}

export function ApiKeyRow({
  apiKey,
  canRevoke,
  confirmingRevoke,
  onRequestRevoke,
}: ApiKeyRowProps) {
  const status = statusOf(apiKey)
  const isRevoked = status === "revoked"
  const showRevoke = canRevoke && !isRevoked

  return (
    <TableRow data-testid={`api-key-row-${apiKey.id}`} data-status={status}>
      <TableCell>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-paper-50">{apiKey.name}</span>
          {apiKey.scopes.length > 0 ? (
            <span className="text-[10px] uppercase tracking-wider text-paper-200/50">
              {apiKey.scopes.join(" · ")}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        {/* JetBrains Mono per the UI spec — the
            key/token/code-like typography axis. */}
        <code
          className="font-mono text-xs text-paper-200/70"
          data-testid={`api-key-masked-${apiKey.id}`}
        >
          {maskedKeyFor(apiKey.id)}
        </code>
      </TableCell>
      <TableCell className="text-xs text-paper-200/70">{formatDate(apiKey.created_at)}</TableCell>
      <TableCell className="text-xs text-paper-200/70">{formatDate(apiKey.last_used_at)}</TableCell>
      <TableCell>
        <Badge
          variant={isRevoked ? "secondary" : "success"}
          size="sm"
          data-testid={`api-key-status-${apiKey.id}`}
        >
          {isRevoked ? "Revoked" : "Active"}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        {showRevoke ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onRequestRevoke(apiKey)}
            disabled={confirmingRevoke}
            data-testid={`api-key-revoke-${apiKey.id}`}
            className="text-paper-200 hover:bg-destructive/10 hover:text-destructive"
          >
            <Icon name="X" className="h-3.5 w-3.5" />
            <span>Revoke</span>
          </Button>
        ) : (
          <span className="text-xs text-paper-200/40">—</span>
        )}
      </TableCell>
    </TableRow>
  )
}
