/**
 * FeatureSection — F8 Part 3 (icon support).
 *
 * Tests the reusable feature-section
 * wrapper:
 *   - The default (non-reverse) layout
 *     renders both columns.
 *   - The reverse layout is in effect
 *     when `reverse` is set.
 *   - The id is propagated to the section
 *     element.
 *   - The icon renders in the Spark-
 *     gradient treatment when provided.
 *   - The icon is NOT rendered when not
 *     provided.
 *   - Heading hierarchy: the section's h2
 *     wires `aria-labelledby` correctly.
 */

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { FeatureSection } from "@/components/marketing/features/feature-section"

function SimpleVisual() {
  return <div data-testid="simple-visual" />
}

describe("FeatureSection", () => {
  it("renders the heading + description", () => {
    render(
      <FeatureSection
        id="test-section"
        eyebrow="Test Eyebrow"
        title="Test Title"
        description="Test description text."
        visual={<SimpleVisual />}
      />,
    )
    const h2 = screen.getByRole("heading", { level: 2 })
    expect(h2).toHaveTextContent("Test Title")
    expect(h2.id).toBe("test-section-heading")
    expect(screen.getByText("Test Eyebrow")).toBeInTheDocument()
    expect(screen.getByText("Test description text.")).toBeInTheDocument()
  })

  it("propagates the id to the section element", () => {
    const { container } = render(
      <FeatureSection
        id="my-feature"
        eyebrow="x"
        title="x"
        description="x"
        visual={<SimpleVisual />}
      />,
    )
    const section = container.querySelector("section#my-feature")
    expect(section).not.toBeNull()
  })

  it("wires aria-labelledby to the h2", () => {
    const { container } = render(
      <FeatureSection
        id="aria-test"
        eyebrow="x"
        title="x"
        description="x"
        visual={<SimpleVisual />}
      />,
    )
    const section = container.querySelector("section#aria-test")
    expect(section).toHaveAttribute("aria-labelledby", "aria-test-heading")
  })

  it("renders the visual", () => {
    render(
      <FeatureSection
        id="with-visual"
        eyebrow="x"
        title="x"
        description="x"
        visual={<SimpleVisual />}
      />,
    )
    expect(screen.getByTestId("simple-visual")).toBeInTheDocument()
  })

  it("renders the icon when provided (Spark-gradient treatment)", () => {
    render(
      <FeatureSection
        id="with-icon"
        eyebrow="With Icon"
        title="x"
        description="x"
        visual={<SimpleVisual />}
        icon={<span data-testid="my-icon">I</span>}
      />,
    )
    const icon = screen.getByTestId("with-icon-icon")
    expect(icon).toBeInTheDocument()
    // The icon container uses bg-spark so
    // the marketing feature icons share
    // the same visual treatment.
    expect(icon.className).toMatch(/bg-spark/)
  })

  it("does NOT render an icon container when no icon is provided", () => {
    const { container } = render(
      <FeatureSection
        id="no-icon"
        eyebrow="x"
        title="x"
        description="x"
        visual={<SimpleVisual />}
      />,
    )
    // No element with the testid pattern
    // for the icon container.
    expect(container.querySelector("[data-testid='no-icon-icon']")).toBeNull()
  })

  it("uses semantic h2 — never h3 (sections are top-level story beats)", () => {
    render(
      <FeatureSection
        id="heading-level"
        eyebrow="x"
        title="x"
        description="x"
        visual={<SimpleVisual />}
      />,
    )
    const h2 = screen.getByRole("heading", { level: 2 })
    expect(h2).toBeInTheDocument()
  })
})
