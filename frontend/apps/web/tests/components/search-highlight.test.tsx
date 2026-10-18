import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { highlight } from "@/components/search/highlight"

function marks(text: string, query: string) {
  const { container } = render(<p>{highlight(text, query)}</p>)
  return [...container.querySelectorAll("mark")].map((m) => m.textContent)
}

describe("highlight", () => {
  it("marks every case-insensitive occurrence of each term", () => {
    expect(marks("Hybrid search fuses search results", "SEARCH hybrid")).toEqual([
      "Hybrid",
      "search",
      "search",
    ])
  })

  it("ignores short terms and regex metacharacters safely", () => {
    expect(marks("a (b) c++ rank", "a c++ (b)")).toEqual([])
    expect(marks("cost is $5.00 (est.)", "(est.)")).toEqual(["est"])
  })

  it("keeps the full text intact", () => {
    const { container } = render(<p>{highlight("pgvector halfvec index", "halfvec")}</p>)
    expect(container.textContent).toBe("pgvector halfvec index")
  })
})
