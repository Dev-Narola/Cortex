/**
 * Card — unit tests.
 *
 * F1 Part 3 (Task 21).
 */

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./index"

describe("Card", () => {
  it("renders the surface with default classes", () => {
    render(<Card data-testid="card">Body</Card>)
    const card = screen.getByTestId("card")
    expect(card.tagName).toBe("DIV")
    expect(card).toHaveTextContent("Body")
    expect(card.className).toMatch(/rounded-xl/)
    expect(card.className).toMatch(/bg-background/)
  })

  it("applies variant classes", () => {
    render(
      <Card data-testid="card" variant="elevated">
        Body
      </Card>,
    )
    const card = screen.getByTestId("card")
    expect(card.className).toMatch(/shadow-md/)
  })

  it("applies interactive cursor + hover transitions", () => {
    render(
      <Card data-testid="card" variant="interactive">
        Body
      </Card>,
    )
    const card = screen.getByTestId("card")
    expect(card.className).toMatch(/cursor-pointer/)
  })

  it("marks non-default state via data-state", () => {
    const { rerender } = render(<Card state="default">Body</Card>)
    expect(screen.getByText("Body").getAttribute("data-state")).toBeNull()

    rerender(
      <Card state="selected" data-testid="card">
        Body
      </Card>,
    )
    expect(screen.getByTestId("card").getAttribute("data-state")).toBe("selected")
  })

  it("composes Header + Title + Description + Content + Footer", () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Subtitle</CardDescription>
        </CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>
          <button type="button">Action</button>
        </CardFooter>
      </Card>,
    )
    expect(screen.getByText("Title").tagName).toBe("H3")
    expect(screen.getByText("Subtitle").tagName).toBe("P")
    expect(screen.getByText("Body")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Action" })).toBeInTheDocument()
  })

  it("CardFooter lays out actions per the `justify` axis", () => {
    const { rerender } = render(
      <CardFooter data-testid="footer" justify="between">
        <span>A</span>
        <span>B</span>
      </CardFooter>,
    )
    expect(screen.getByTestId("footer").className).toMatch(/justify-between/)

    rerender(
      <CardFooter data-testid="footer" justify="start">
        <span>A</span>
      </CardFooter>,
    )
    expect(screen.getByTestId("footer").className).toMatch(/justify-start/)
  })
})
