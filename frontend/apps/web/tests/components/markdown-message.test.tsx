import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { MarkdownMessage, linkCitations } from "@/components/chat/MarkdownMessage"

const citations = [
  { id: "c1", index: 1, documentTitle: "Platform guide" },
  { id: "c2", index: 2, documentTitle: "Runbook" },
]

describe("linkCitations", () => {
  it("links [n] and 【n】/【n†source】 markers", () => {
    expect(linkCitations("A [1] B 【2】 C 【3†source】")).toBe(
      "A [1](#cite-1) B [2](#cite-2) C [3](#cite-3)",
    )
  })

  it("links the [Source n] form the model also uses", () => {
    expect(linkCitations("Reranked by an LLM. [Source 1] [source 2]")).toBe(
      "Reranked by an LLM. [1](#cite-1) [2](#cite-2)",
    )
  })

  it("leaves code and real Markdown links alone", () => {
    expect(linkCitations("use `arr[1]` and [docs](https://x.dev)")).toBe(
      "use `arr[1]` and [docs](https://x.dev)",
    )
    expect(linkCitations("```\nx = a[1]\n```")).toBe("```\nx = a[1]\n```")
  })
})

describe("MarkdownMessage", () => {
  it("renders Markdown structure", () => {
    render(<MarkdownMessage content={"## Steps\n\n- **Parse** the file\n- Embed it"} />)
    expect(screen.getByRole("heading", { name: "Steps" })).toBeInTheDocument()
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
    expect(screen.getByText("Parse").tagName).toBe("STRONG")
  })

  it("turns known citation markers into source chips", () => {
    render(
      <MarkdownMessage
        content="Hybrid search uses RRF [1] and a reranker 【2】."
        citations={citations}
      />,
    )
    expect(
      screen.getByRole("button", { name: "View source citation 1, Platform guide" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "View source citation 2, Runbook" }),
    ).toBeInTheDocument()
  })

  it("never invents a source for a marker without a citation", () => {
    render(<MarkdownMessage content="Unsupported claim [7]." citations={citations} />)
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    expect(screen.getByText("[7]")).toBeInTheDocument()
  })

  it("does not render raw HTML from the model", () => {
    const { container } = render(
      <MarkdownMessage content={'<img src=x onerror="alert(1)"> <script>alert(1)</script>'} />,
    )
    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector("script")).toBeNull()
  })

  it("opens external links safely in a new tab", () => {
    render(<MarkdownMessage content="See [the docs](https://cortex.dev/docs)." />)
    const link = screen.getByRole("link", { name: "the docs" })
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
  })
})
