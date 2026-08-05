/**
 * Layout primitives — unit tests.
 *
 * F1 Part 4 (Task 36).
 */

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Container, Grid, Page, PageContent, PageHeader, Section } from "./index"

describe("Page", () => {
  it("renders as a <main> with max-w on the default size", () => {
    render(<Page data-testid="page">Body</Page>)
    const page = screen.getByTestId("page")
    expect(page.tagName).toBe("MAIN")
    expect(page.className).toMatch(/max-w-5xl/)
  })
  it("applies the size axis", () => {
    render(
      <Page size="lg" data-testid="page">
        Body
      </Page>,
    )
    expect(screen.getByTestId("page").className).toMatch(/max-w-7xl/)
  })
  it("full size removes the max-w cap", () => {
    render(
      <Page size="full" data-testid="page">
        Body
      </Page>,
    )
    expect(screen.getByTestId("page").className).toMatch(/max-w-none/)
  })
})

describe("PageHeader", () => {
  it("renders title + description + actions", () => {
    render(
      <PageHeader
        title="Settings"
        description="Manage your account"
        actions={<button type="button">Save</button>}
      />,
    )
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument()
    expect(screen.getByText("Manage your account")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument()
  })
})

describe("PageContent", () => {
  it("renders a flex column with gap-6", () => {
    render(<PageContent data-testid="content">Body</PageContent>)
    expect(screen.getByTestId("content").className).toMatch(/flex-col gap-6/)
  })
})

describe("Section", () => {
  it("renders a <section> with aria-labelledby pointing at the title", () => {
    render(
      <Section title="Profile" data-testid="section">
        Body
      </Section>,
    )
    const section = screen.getByTestId("section")
    const heading = screen.getByRole("heading", { level: 2, name: "Profile" })
    expect(section.tagName).toBe("SECTION")
    expect(section.getAttribute("aria-labelledby")).toBe(heading.id)
  })
})

describe("Container", () => {
  it("renders the size axis", () => {
    render(
      <Container size="md" data-testid="c">
        Body
      </Container>,
    )
    expect(screen.getByTestId("c").className).toMatch(/max-w-4xl/)
  })
  it("narrow density tightens the mobile padding", () => {
    render(
      <Container density="narrow" data-testid="c">
        Body
      </Container>,
    )
    expect(screen.getByTestId("c").className).toMatch(/px-2 sm:px-4/)
  })
})

describe("Grid", () => {
  it("defaults to 1/2/3/4 columns across breakpoints", () => {
    render(
      <Grid data-testid="g">
        <span>A</span>
      </Grid>,
    )
    const g = screen.getByTestId("g")
    expect(g.className).toMatch(/grid-cols-1/)
    expect(g.className).toMatch(/sm:grid-cols-2/)
    expect(g.className).toMatch(/md:grid-cols-3/)
    expect(g.className).toMatch(/lg:grid-cols-4/)
  })
  it("honours the cols override", () => {
    render(
      <Grid cols={{ base: 1, md: 2, lg: 3 }} data-testid="g">
        <span>A</span>
      </Grid>,
    )
    const g = screen.getByTestId("g")
    expect(g.className).toMatch(/grid-cols-1/)
    expect(g.className).toMatch(/md:grid-cols-2/)
    expect(g.className).toMatch(/lg:grid-cols-3/)
    expect(g.className).not.toMatch(/sm:grid-cols-/)
  })
  it("applies the gap axis", () => {
    render(
      <Grid gap="lg" data-testid="g">
        <span>A</span>
      </Grid>,
    )
    expect(screen.getByTestId("g").className).toMatch(/gap-6/)
  })
})
