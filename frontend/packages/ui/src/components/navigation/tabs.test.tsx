/**
 * Tabs — unit tests.
 *
 * F1 Part 4 (Task 37).
 */

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "./Tabs"

describe("Tabs", () => {
  it("renders all triggers and only the active content", () => {
    render(
      <Tabs defaultValue="overview">
        <TabsList aria-label="Document sections">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">Overview content</TabsContent>
        <TabsContent value="details">Details content</TabsContent>
      </Tabs>,
    )
    expect(screen.getByRole("tablist")).toHaveAttribute("aria-label", "Document sections")
    expect(screen.getByText("Overview content")).toBeInTheDocument()
    expect(screen.queryByText("Details content")).not.toBeInTheDocument()
  })

  it("switches content on trigger click", async () => {
    const user = userEvent.setup()
    render(
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">Overview content</TabsContent>
        <TabsContent value="details">Details content</TabsContent>
      </Tabs>,
    )
    await user.click(screen.getByRole("tab", { name: "Details" }))
    expect(screen.getByText("Details content")).toBeInTheDocument()
  })

  it("marks the active trigger with aria-selected=true", () => {
    render(
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">Overview content</TabsContent>
        <TabsContent value="details">Details content</TabsContent>
      </Tabs>,
    )
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "false")
  })
})
