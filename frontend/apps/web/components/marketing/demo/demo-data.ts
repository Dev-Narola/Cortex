/**
 * Demo data — the seeded question + answer
 * + citation payload for the F8 Live Demo.
 *
 * **F8 Part 4.** The marketing demo runs
 * entirely on this local data. There is
 * no backend call, no auth, no tenant
 * resolution. The point of the demo is to
 * communicate the *visual grammar* of the
 * real product (a streamed answer with
 * real citations), not to actually run
 * retrieval.
 *
 * **Why seeded + realistic.** Per the F8
 * spec: "Use real questions that
 * demonstrate actual Cortex capabilities.
 * Don't use meaningless demo questions
 * such as 'What is the weather today?'
 * because that doesn't demonstrate
 * Cortex." Each question below maps to
 * one of the four F8 feature beats
 * (Hybrid Search, Knowledge Graph, Agents
 * + MCP, Citations), so a visitor can
 * pick a chip and immediately see the
 * capability behind it.
 *
 * **The answer string contains a
 * `{{citation:1}}` placeholder where the
 * citation marker should appear in the
 * running text.** The streaming
 * simulation replaces this placeholder
 * with a real `<DemoCitation />` chip
 * (just like the real F4 chat inserts
 * `<CitationChip />` markers in the
 * assistant text).
 *
 * **Source name is fictional** — the F8
 * spec is explicit: "Don't expose
 * internal project files... Use
 * fictional/neutral sample source names."
 * The sources are "Retrieval Notes.md",
 * "Tenant Isolation.md", and "Cortex
 * Architecture.md" — plausible user
 * documents, neither internal Cortex
 * project files nor real customer data.
 *
 * **API boundary.** Even though this is
 * seeded data, the structure is designed
 * to be the same shape a future public
 * demo endpoint would return. A future
 * contributor can swap `getSeededDemo` for
 * an `ApiDemoProvider` without touching
 * any UI code.
 */

/** A single citation's source info. */
export interface DemoCitation {
  /** Stable id (used as the panel's
   *  selection key). */
  id: string
  /** 1-based index. The marker is rendered
   *  as `[1]`. */
  index: number
  /** Document title (the "Source" label). */
  documentTitle: string
  /** Optional sub-label (e.g. "Section /
   *  Page"). Matches the real F4 chat
   *  CitationPanel's structure. */
  location: string
  /** The excerpt — a few lines from the
   *  source. The marketing demo shows the
   *  excerpt in the source panel so the
   *  visitor can read the underlying
   *  text, not just the metadata. */
  excerpt: string
}

/** A single seeded demo Q&A. */
export interface DemoEntry {
  /** Stable id (used as the React key). */
  id: string
  /** The chip label — the short question
   *  the visitor clicks. */
  chipLabel: string
  /** The full question text — what goes
   *  into the chat composer when this chip
   *  is clicked. */
  question: string
  /** The answer, including the
   *  `{{citation:N}}` placeholders. The
   *  streaming simulation replaces each
   *  placeholder with a `<DemoCitation />`
   *  chip. */
  answer: string
  /** The citations, in order. */
  citations: ReadonlyArray<DemoCitation>
}

/** The seeded questions. */
export const DEMO_ENTRIES: ReadonlyArray<DemoEntry> = [
  {
    id: "hybrid-search",
    chipLabel: "How does hybrid search work?",
    question: "How does Cortex combine keyword and semantic search?",
    answer:
      "Cortex combines {{citation:1}} keyword search (Postgres full-text) with semantic vector search (pgvector), fuses the two result lists with reciprocal rank fusion, and reranks the candidates with a cross-encoder before generation. {{citation:2}} This produces results that match the exact terminology *and* the meaning — not one or the other.",
    citations: [
      {
        id: "hybrid-1",
        index: 1,
        documentTitle: "Retrieval Notes.md",
        location: "Section: Hybrid Retrieval · Page 12",
        excerpt:
          "Keyword (BM25) and dense vector retrieval are fused with reciprocal rank fusion (RRF) before a cross-encoder reranker scores the top-k candidates. RRF is robust to score-scale differences between retrievers.",
      },
      {
        id: "hybrid-2",
        index: 2,
        documentTitle: "Retrieval Notes.md",
        location: "Section: Why hybrid · Page 14",
        excerpt:
          "Pure vector retrieval misses exact terminology; pure keyword retrieval misses semantic paraphrases. The hybrid approach is the standard remedy in production RAG systems.",
      },
    ],
  },
  {
    id: "knowledge-graph",
    chipLabel: "How are entities connected?",
    question: "How does the knowledge graph connect entities in my docs?",
    answer:
      "As you upload, Cortex extracts {{citation:1}} entities (people, concepts, projects, technologies) and the relationships between them, then stores them in a tenant-scoped knowledge graph. Retrieval traverses the graph to pull connected context — not just isolated chunks. {{citation:2}} This is what lets a question about 'Dev's role in the Cortex project' return the right combination of documents, concepts, and edges.",
    citations: [
      {
        id: "kg-1",
        index: 1,
        documentTitle: "Cortex Architecture.md",
        location: "Section: Knowledge graph · Page 4",
        excerpt:
          "Entity and relation extraction is performed during ingestion using an LLM. The result is a tenant-scoped graph that retrieval can traverse in addition to (or instead of) vector lookup.",
      },
      {
        id: "kg-2",
        index: 2,
        documentTitle: "Tenant Isolation.md",
        location: "Section: Graph scoping · Page 2",
        excerpt:
          "The knowledge graph is scoped to the tenant. A query that traverses the graph never crosses tenant boundaries; the schema enforces this at the SQL level.",
      },
    ],
  },
  {
    id: "citations",
    chipLabel: "Where did this answer come from?",
    question: "How does Cortex keep answers traceable to their sources?",
    answer:
      "Every claim the assistant makes {{citation:1}} carries a citation marker that links to the exact source document, section, and page. The marker isn't decorative — clicking it opens the underlying excerpt so you can verify the answer in one click. {{citation:2}} This is the difference between 'AI you can trust' and 'AI you can verify'.",
    citations: [
      {
        id: "cite-1",
        index: 1,
        documentTitle: "Cortex Architecture.md",
        location: "Section: Citations · Page 18",
        excerpt:
          "The chat response model includes citation metadata with each grounded claim. The marker in the rendered text is bound to a specific (document, section, page) tuple — not a fuzzy search hit.",
      },
      {
        id: "cite-2",
        index: 2,
        documentTitle: "Retrieval Notes.md",
        location: "Section: Traceability · Page 9",
        excerpt:
          "Trust in an AI answer comes from the reader being able to verify it. Citations turn 'AI you can trust' into 'AI you can verify' — the reader follows the marker, reads the source, and decides.",
      },
    ],
  },
]

/**
 * `getSeededDemo(question)` — resolve a
 * seeded demo entry by question text.
 *
 * **Why match by question text.** The
 * marketing demo auto-submits the
 * question text that was passed in (not
 * the chip id), so the future swap to a
 * real backend uses the same `question`
 * payload. The seeded lookup is a
 * normalised substring match — the chip
 * populates the input with the canonical
 * question, the user may tweak it, and
 * we still resolve to a sensible demo.
 *
 * Returns `null` when nothing matches.
 */
export function getSeededDemo(question: string): DemoEntry | null {
  const normalised = question.trim().toLowerCase()
  if (!normalised) return null
  // Exact match wins.
  for (const entry of DEMO_ENTRIES) {
    if (entry.question.toLowerCase() === normalised) return entry
  }
  // Substring match — the chip populates
  // the input with the canonical question;
  // we still want to find a sensible demo
  // if the visitor tweaks the wording.
  for (const entry of DEMO_ENTRIES) {
    if (
      entry.question.toLowerCase().includes(normalised) ||
      normalised.includes(entry.question.toLowerCase())
    ) {
      return entry
    }
  }
  return null
}

/**
 * Parse the `{{citation:N}}` placeholders
 * in an answer string into a sequence of
 * segments. Each segment is either plain
 * text or a citation reference. The
 * streaming simulation renders plain
 * text segments character-by-character
 * and inserts the citation chip at the
 * right moment.
 */
export type AnswerSegment =
  | { kind: "text"; value: string }
  | { kind: "citation"; id: string; index: number }

export function parseAnswer(answer: string): AnswerSegment[] {
  // Split on `{{citation:N}}` placeholders
  // (the numeric N is the 1-based index).
  const parts: AnswerSegment[] = []
  const regex = /\{\{citation:(\d+)\}\}/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(answer)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ kind: "text", value: answer.slice(lastIndex, match.index) })
    }
    const id = `citation-${match[1]}`
    parts.push({
      kind: "citation",
      id,
      index: Number.parseInt(match[1] ?? "1", 10),
    })
    lastIndex = regex.lastIndex
  }
  if (lastIndex < answer.length) {
    parts.push({ kind: "text", value: answer.slice(lastIndex) })
  }
  return parts
}
