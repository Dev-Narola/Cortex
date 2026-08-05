/**
 * Data display primitives — Avatar, Badge.
 *
 * F1 Part 4 (Task 37).
 */

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Avatar } from "./Avatar"
import { Badge } from "./Badge"

describe("Avatar", () => {
  it("renders initials from the name when no image is provided", () => {
    render(<Avatar name="Ada Lovelace" />)
    expect(screen.getByText("AL")).toBeInTheDocument()
  })
  it("uses the explicit fallback when provided", () => {
    render(<Avatar name="Ada Lovelace" fallback="AD" />)
    expect(screen.getByText("AD")).toBeInTheDocument()
  })
  it("falls back to the icon when neither image nor initials are available", () => {
    render(<Avatar icon="User" />)
    // Icon is rendered as an SVG
    expect(screen.getByRole("img")).toBeInTheDocument()
  })
  it("applies the tone axis", () => {
    render(<Avatar name="Ada" tone="primary" data-testid="avatar" />)
    expect(screen.getByTestId("avatar").className).toMatch(/ember/)
  })
  it("applies the size axis", () => {
    render(<Avatar name="Ada" size="lg" data-testid="avatar" />)
    expect(screen.getByTestId("avatar").className).toMatch(/h-14 w-14/)
  })
  it("applies the shape axis (square)", () => {
    render(<Avatar name="Ada" shape="square" data-testid="avatar" />)
    expect(screen.getByTestId("avatar").className).toMatch(/rounded-md/)
  })
  it("uses the role=img with an accessible label", () => {
    render(<Avatar name="Ada Lovelace" />)
    const img = screen.getByRole("img")
    expect(img).toHaveAttribute("aria-label", "Ada Lovelace")
  })
  it("renders the image with src + name fallback when given both", () => {
    const { container } = render(<Avatar src="https://example.com/missing.png" name="Ada" />)
    // The wrapper has role="img" + aria-label="Ada"; the inner <img>
    // has the src. We assert the wiring via the rendered HTML.
    const wrapper = container.querySelector('[role="img"]')
    expect(wrapper).toHaveAttribute("aria-label", "Ada")
    const innerImg = wrapper?.querySelector("img")
    expect(innerImg).toHaveAttribute("src", "https://example.com/missing.png")
  })
})

describe("Badge", () => {
  it("renders the children text", () => {
    render(<Badge>Active</Badge>)
    expect(screen.getByText("Active")).toBeInTheDocument()
  })
  it("applies the variant axis", () => {
    render(
      <Badge variant="success" data-testid="b">
        Done
      </Badge>,
    )
    expect(screen.getByTestId("b").className).toMatch(/success/)
  })
  it("applies the size axis", () => {
    render(
      <Badge size="lg" data-testid="b">
        Big
      </Badge>,
    )
    expect(screen.getByTestId("b").className).toMatch(/h-7/)
  })
})
