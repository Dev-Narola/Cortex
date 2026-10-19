/**
 * SearchView — hybrid search over the workspace (POST /api/v1/search).
 *
 * The submitted query lives in the URL (?q=), so results survive reloads and
 * the back button. Results show the source document, chunk position and the
 * backend's relevance score; selecting one opens the document drawer.
 */

"use client"

import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { type FormEvent, useState } from "react"

import { Button, Card, EmptyState, Icon, PageHeader, Skeleton } from "@cortex/ui"

import { useDocumentSelectionStore } from "@/components/documents/DocumentSelectionStore"
import { highlight } from "@/components/search/highlight"
import { searchKnowledge } from "@/services/search/searchKnowledge"

const LIMIT = 10

export function SearchView({ initialQuery }: { initialQuery: string }) {
  const router = useRouter()
  const openDetail = useDocumentSelectionStore((s) => s.openDetail)
  const [draft, setDraft] = useState(initialQuery)
  const [query, setQuery] = useState(initialQuery.trim())

  const search = useQuery({
    queryKey: ["search", query, LIMIT],
    queryFn: ({ signal }) => searchKnowledge(query, LIMIT, signal),
    enabled: query.length > 0,
    staleTime: 60_000,
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const q = draft.trim().slice(0, 2048)
    if (!q) return
    setQuery(q)
    router.replace(`/app/search?q=${encodeURIComponent(q)}` as never)
  }

  const results = search.data?.results ?? []

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Search"
        description="Hybrid keyword and semantic search across every indexed document, reranked for relevance."
      />

      <form
        onSubmit={onSubmit}
        // biome-ignore lint/a11y/useSemanticElements: <search> isn't announced by all screen readers yet; role="search" is
        role="search"
        className="flex items-center gap-2 rounded-full border border-border bg-card p-1.5 pl-3 shadow-md transition-[border-color,box-shadow] duration-base focus-within:border-brand-border focus-within:shadow-[0_0_0_4px_var(--brand-soft)]"
      >
        <Icon name="Search" className="ml-1 h-5 w-5 shrink-0 text-faint" aria-hidden />
        <label htmlFor="search-q" className="sr-only">
          Search your knowledge base
        </label>
        <input
          id="search-q"
          // biome-ignore lint/a11y/noAutofocus: the page exists to type a query; ⌘K lands here
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={2048}
          placeholder="e.g. how are documents chunked?"
          className="h-10 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-faint"
        />
        <Button type="submit" className="h-10" disabled={!draft.trim() || search.isFetching}>
          {search.isFetching ? "Searching…" : "Search"}
        </Button>
      </form>

      <section aria-label="Results" aria-busy={search.isFetching} className="flex flex-col gap-3">
        {!query ? (
          <EmptyState
            icon="Search"
            title="Search your knowledge base"
            description="Results come from documents that have finished indexing. Each result links to the passage it came from."
          />
        ) : search.isLoading ? (
          [0, 1, 2].map((i) => <Skeleton key={i} size="h-28 w-full" className="rounded-2xl" />)
        ) : search.isError ? (
          <Card radius="xl" className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Search failed. Check your connection and try again.
            </p>
            <Button variant="outline" size="sm" onClick={() => void search.refetch()}>
              Retry
            </Button>
          </Card>
        ) : results.length === 0 ? (
          <EmptyState
            icon="SearchX"
            title="No matching passages"
            description="Try different wording, or check that the documents you expect have finished indexing."
          />
        ) : (
          <>
            <p className="text-xs text-faint" aria-live="polite">
              {results.length} {results.length === 1 ? "passage" : "passages"} for “{query}”
            </p>
            <ol className="stagger-rise flex flex-col gap-3">
              {results.map((r) => (
                <li key={r.chunk_id}>
                  <button
                    type="button"
                    onClick={() => openDetail(r.document_id)}
                    className="group block w-full rounded-2xl border border-border bg-card p-5 text-left shadow-xs transition-[transform,border-color,box-shadow] duration-base hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Icon
                        name="FileText"
                        className="h-3.5 w-3.5 shrink-0 text-brand"
                        aria-hidden
                      />
                      <span className="min-w-0 truncate font-medium text-foreground">
                        {r.document_title ?? "Untitled document"}
                      </span>
                      <span className="shrink-0 text-faint">· passage {r.chunk_index + 1}</span>
                      <span
                        className="tabular ml-auto shrink-0 font-mono text-faint"
                        title="Relevance score"
                      >
                        {r.score.toFixed(3)}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-muted-foreground">
                      {highlight(r.content, query)}
                    </p>
                  </button>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>
    </div>
  )
}
