/**
 * MarkdownMessage — renders an assistant answer as GitHub-flavoured Markdown.
 *
 * Safety: react-markdown builds React elements and never renders raw HTML
 * from the model; links open in a new tab with rel=noopener.
 *
 * Citations: the backend asks the model to cite as [1], [2] (gpt-oss
 * sometimes writes 【1】, 【1†source】 or [Source 1]). Markers become chips that open the
 * citation panel, but only when the message really has citation n; any other
 * marker stays plain text, so no source is ever invented.
 */

"use client"

import type { ReactNode } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

import { CitationChip } from "./citations/CitationChip"

export interface MarkdownCitation {
  id: string
  index: number
  documentTitle?: string
}

const MARKER = /【(\d{1,3})(?:†[^】]*)?】|\[(?:source\s+)?(\d{1,3})\](?![(:[])/gi

/** Turn citation markers into `[n](#cite-n)` links, leaving code untouched. */
export function linkCitations(md: string): string {
  return md
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((part, i) =>
      i % 2 === 1 ? part : part.replace(MARKER, (_m, a, b) => `[${a ?? b}](#cite-${a ?? b})`),
    )
    .join("")
}

function components(citations: ReadonlyArray<MarkdownCitation>): Components {
  return {
    a({ href, children }) {
      const n = href?.startsWith("#cite-") ? Number(href.slice(6)) : null
      if (n !== null) {
        const c = citations.find((x) => x.index === n)
        return c ? (
          <CitationChip id={c.id} index={c.index} documentTitle={c.documentTitle} />
        ) : (
          <span className="text-faint">[{n}]</span>
        )
      }
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-ink underline underline-offset-2"
        >
          {children}
        </a>
      )
    },
    pre: ({ children }) => (
      <pre className="my-3 overflow-x-auto rounded-lg border border-border bg-background-2 p-3 font-mono text-[0.8rem] leading-relaxed">
        {children}
      </pre>
    ),
    code: ({ className, children }) => (
      <code className={className ?? "rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"}>
        {children}
      </code>
    ),
    table: ({ children }) => (
      <div className="my-3 overflow-x-auto">
        <table className="w-full border-collapse text-left text-[0.85rem]">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className="border-b border-border px-2 py-1.5 font-semibold">{children}</th>
    ),
    td: ({ children }) => (
      <td className="border-b border-divider px-2 py-1.5 align-top">{children}</td>
    ),
  }
}

export function MarkdownMessage({
  content,
  citations = [],
}: {
  content: string
  citations?: ReadonlyArray<MarkdownCitation>
}): ReactNode {
  return (
    <div className="md-answer break-words text-sm leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components(citations)}>
        {linkCitations(content)}
      </ReactMarkdown>
    </div>
  )
}
