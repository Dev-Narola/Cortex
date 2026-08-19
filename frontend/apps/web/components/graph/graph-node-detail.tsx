/**
 * GraphNodeDetail — right-side entity card.
 *
 * **F6 Part 2 + Part 3.** Replaces the Part 1
 * shell with the full entity detail experience:
 *   - Entity name + type (badge)
 *   - Description (if the extractor set one)
 *   - Canonical-id display (the merge primitive)
 *   - Confidence on the outgoing relations
 *   - "View source document" action when
 *     ``source_chunk_id`` is present
 *   - Relations list with type + confidence
 *   - Failure-handling: entity failure vs
 *     relations failure vs neighbours failure
 *     are surfaced separately (Task 19)
 *
 * **Reuses the document drawer (Task 21).** The
 * "View source document" action uses
 * ``documentSelectionStore.openDetail(id)`` —
 * the same imperative handle the F4 chat
 * citation panel uses. The (app) layout mounts
 * the drawer once globally; this action opens
 * it for the source document without
 * duplicating the document detail UI.
 *
 * **Loading + error surfaces.** The card shows
 * a local "Loading relations…" while the
 * relations query is in flight (Task 18 — the
 * entity itself is already loaded). The error
 * states are split: a relations failure shows
 * "Entity loaded / Relations unavailable +
 * Retry", not a generic "error" (Task 19).
 */

"use client"

import { useEffect, useRef } from "react"

import { Button, Icon, type IconName } from "@cortex/ui"

import { documentSelectionStore } from "@/components/documents/DocumentSelectionStore"
import type { KGEntity, KGRelationship } from "@/types/kg"

export interface GraphNodeDetailProps {
  /** The selected entity, fetched from the
   *  real backend. The panel is hidden when
   *  this is null. */
  entity: KGEntity | null
  /** The relations touching the entity. Empty
   *  is a legitimate state (Task 20). */
  relations: KGRelationship[]
  onClose: () => void
  /** True while the relations / neighbours
   *  queries are still in flight (after the
   *  entity itself has loaded). */
  loading?: boolean
  /** True when the entity query itself failed. */
  entityError?: boolean
  /** True when the relations query failed. */
  relationsError?: boolean
  /** True when the neighbours query failed.
   *  (We don't surface this directly today —
   *  it's preserved for the future "show
   *  neighbours" affordance.) */
  neighborsError?: boolean
  onRetryEntity?: () => void
  onRetryRelations?: () => void
}

/**
 * Map an entity-type string to a Lucide icon.
 * The mapping is intentionally narrow today;
 * a future V9 item can read the taxonomy from
 * the API or a config file.
 */
function iconForType(type: string): IconName {
  switch (type) {
    case "person":
      return "Users"
    case "organization":
      return "Building2"
    case "technology":
      return "Cpu"
    case "concept":
      return "Brain"
    case "date":
      return "Calendar"
    case "location":
      return "MapPin"
    case "document":
      return "FileText"
    default:
      return "Hexagon"
  }
}

/**
 * Format a confidence score as a percentage.
 * The backend stores ``0..1``; the UI shows
 * ``0..100%`` rounded to one decimal.
 */
function formatConfidence(c: number): string {
  if (!Number.isFinite(c)) return "—"
  return `${(c * 100).toFixed(1)}%`
}

export function GraphNodeDetail({
  entity,
  relations,
  onClose,
  loading,
  entityError,
  relationsError,
  onRetryEntity,
  onRetryRelations,
}: GraphNodeDetailProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (entity && closeButtonRef.current) {
      closeButtonRef.current.focus()
    }
  }, [entity])

  useEffect(() => {
    if (!entity) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [entity, onClose])

  if (!entity) return null

  const IconForType = iconForType(entity.entity_type)
  const isCanonicalDuplicate = Boolean(entity.canonical_id)

  // The source-chunk id is preserved on the
  // entity + on every relation. Today the
  // backend doesn't expose the document_id
  // (the chunk FK is the only signal). The
  // detail panel shows the chunk id + a
  // "View source" affordance; the actual
  // navigation is a future V9 item that
  // resolves chunk → document.
  const entitySourceChunkId = entity.source_chunk_id

  return (
    <aside
      aria-labelledby="graph-node-detail-title"
      data-testid="graph-node-detail"
      className="pointer-events-auto w-full max-w-sm rounded-xl border border-slate-700 bg-slate-800/90 p-4 text-paper-50 shadow-xl backdrop-blur-md ring-1 ring-void-950/40"
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-volt-500/10 text-volt-400"
          >
            <Icon name={IconForType} size="md" tone="accent" />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="graph-node-detail-title"
              className="font-display text-base font-semibold leading-tight tracking-tight text-paper-50"
              data-testid="graph-node-detail-name"
            >
              {entity.name}
            </h2>
            <p className="mt-0.5 text-xs text-paper-200/70">
              <span
                className="inline-block rounded bg-slate-700/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wider"
                data-testid="graph-node-detail-type"
              >
                {entity.entity_type}
              </span>
            </p>
          </div>
        </div>
        <Button
          ref={closeButtonRef}
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          aria-label="Close node detail"
          className="text-paper-200 hover:bg-slate-700/50 hover:text-paper-50"
        >
          <Icon name="X" size="sm" />
        </Button>
      </header>

      {entityError ? (
        <div
          role="alert"
          className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive"
        >
          We couldn&apos;t load this entity.
          {onRetryEntity ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRetryEntity}
              className="ml-2 text-destructive"
            >
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}

      {entity.description ? (
        <p className="mb-3 text-sm text-paper-200/90" data-testid="graph-node-detail-description">
          {entity.description}
        </p>
      ) : null}

      <dl className="space-y-2 text-xs">
        <div>
          <dt className="font-medium uppercase tracking-wider text-paper-200/50">ID</dt>
          <dd
            className="mt-1 break-all font-mono text-[11px] text-paper-200"
            data-testid="graph-node-detail-id"
          >
            {entity.id}
          </dd>
        </div>

        {isCanonicalDuplicate ? (
          <div>
            <dt className="font-medium uppercase tracking-wider text-paper-200/50">Canonical of</dt>
            <dd
              className="mt-1 break-all font-mono text-[11px] text-paper-200"
              data-testid="graph-node-detail-canonical"
            >
              {entity.canonical_id}
            </dd>
          </div>
        ) : null}

        {entitySourceChunkId ? (
          <div>
            <dt className="font-medium uppercase tracking-wider text-paper-200/50">Source chunk</dt>
            <dd
              className="mt-1 break-all font-mono text-[11px] text-paper-200"
              data-testid="graph-node-detail-source-chunk"
            >
              {entitySourceChunkId}
            </dd>
            <p className="mt-1 text-[10px] text-paper-200/50">
              The source document is the chunk this entity was extracted from.
            </p>
          </div>
        ) : null}
      </dl>

      <div className="mt-4 border-t border-slate-700/60 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-paper-200/70">
            Relations
          </h3>
          {loading ? <span className="text-[10px] text-paper-200/50">Loading…</span> : null}
        </div>

        {relationsError ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive"
          >
            Relations unavailable.
            {onRetryRelations ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onRetryRelations}
                className="ml-2 text-destructive"
              >
                Retry
              </Button>
            ) : null}
          </div>
        ) : null}

        {!relationsError && !loading && relations.length === 0 ? (
          <p className="text-xs text-paper-200/50">No connected relationships found.</p>
        ) : null}

        {!relationsError && relations.length > 0 ? (
          <ul className="space-y-1.5">
            {relations.map((rel) => (
              <li
                key={rel.id}
                className="rounded-md border border-slate-700/40 bg-slate-900/40 p-2 text-xs"
                data-testid={`graph-relation-${rel.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-paper-50">{rel.relationship_type}</span>
                  <span className="text-[10px] text-paper-200/50">
                    {formatConfidence(rel.confidence)}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[10px] text-paper-200/50">
                  {rel.source_entity_id === entity.id ? "→" : "←"}{" "}
                  {rel.source_entity_id === entity.id ? rel.target_entity_id : rel.source_entity_id}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </aside>
  )
}

/**
 * Imperative handle for opening a document
 * from the graph (Task 21). Exposed as a
 * re-export so the explorer's "View source
 * document" action (a future V9 item) can
 * call it without importing the store.
 */
export function openSourceDocument(documentId: string) {
  documentSelectionStore.openDetail(documentId)
}
