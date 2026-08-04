/**
 * Sidebar + nav components — unit tests.
 *
 * F1 Part 3 (Tasks 27-29).
 *
 * **Scope.** Render the chrome primitives (Sidebar,
 * SidebarItem, Logo, Breadcrumb, Pagination, Topbar,
 * UserMenu, Tabs).
 */

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Home, Settings, Users } from "lucide-react"
import { describe, expect, it, vi } from "vitest"

import { Breadcrumb } from "./Breadcrumb"
import { Logo } from "./Logo"
import { Pagination } from "./Pagination"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./Tabs"
import { Sidebar, SidebarFooter, SidebarItem, SidebarSection } from "./index"

describe("Logo", () => {
  it("renders the wordmark by default", () => {
    render(<Logo />)
    expect(screen.getByText("Cortex")).toBeInTheDocument()
  })

  it("hides the wordmark when showText={false}", () => {
    render(<Logo showText={false} />)
    expect(screen.getByText("Cortex")).toHaveClass("sr-only")
  })

  it("applies the size axis", () => {
    render(<Logo size="xl" data-testid="logo" />)
    const logo = screen.getByTestId("logo")
    expect(logo.className).toMatch(/font-display/)
  })
})

describe("Sidebar", () => {
  it("renders with expanded width by default", () => {
    render(
      <Sidebar data-testid="sidebar">
        <SidebarSection label="Workspace">
          <SidebarItem iconLeft={<Home aria-hidden />}>Home</SidebarItem>
        </SidebarSection>
        <SidebarFooter>Footer</SidebarFooter>
      </Sidebar>,
    )
    const sidebar = screen.getByTestId("sidebar")
    expect(sidebar.tagName).toBe("ASIDE")
    expect(sidebar.className).toMatch(/w-64/)
    expect(screen.getByText("Home")).toBeInTheDocument()
    expect(screen.getByText("Workspace")).toBeInTheDocument()
  })

  it("renders collapsed state with the smaller width", () => {
    render(
      <Sidebar state="collapsed" data-testid="sidebar">
        <SidebarItem iconLeft={<Home aria-hidden />}>Home</SidebarItem>
      </Sidebar>,
    )
    const sidebar = screen.getByTestId("sidebar")
    expect(sidebar.className).toMatch(/w-16/)
    expect(sidebar.getAttribute("data-state")).toBe("collapsed")
  })

  it("marks the active item with aria-current=page", () => {
    render(
      <Sidebar>
        <SidebarSection label="Workspace">
          <SidebarItem state="active" iconLeft={<Home aria-hidden />}>
            Home
          </SidebarItem>
          <SidebarItem iconLeft={<Users aria-hidden />}>Team</SidebarItem>
          <SidebarItem state="disabled" iconLeft={<Settings aria-hidden />}>
            Settings
          </SidebarItem>
        </SidebarSection>
      </Sidebar>,
    )
    const homeLink = screen.getByText("Home").closest("a")
    expect(homeLink).toHaveAttribute("aria-current", "page")
    const teamLink = screen.getByText("Team").closest("a")
    expect(teamLink).not.toHaveAttribute("aria-current")
    const settingsLink = screen.getByText("Settings").closest("a")
    expect(settingsLink).toHaveClass("opacity-50")
  })
})

describe("Breadcrumb", () => {
  it("renders items separated by chevrons, last item as current", () => {
    render(
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "Settings", href: "/settings" },
          { label: "Profile" },
        ]}
      />,
    )
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument()
    // The first two are links
    const homeLink = screen.getByRole("link", { name: "Home" })
    expect(homeLink).toHaveAttribute("href", "/")
    // The last item is marked as current
    const current = screen.getByText("Profile")
    expect(current).toHaveAttribute("aria-current", "page")
  })

  it("collapses middle items when maxItems is set", () => {
    render(
      <Breadcrumb
        maxItems={4}
        items={[
          { label: "Home", href: "/" },
          { label: "A" },
          { label: "B" },
          { label: "C" },
          { label: "D" },
          { label: "E" },
          { label: "End" },
        ]}
      />,
    )
    expect(screen.getByText("Home")).toBeInTheDocument()
    expect(screen.getByText("End")).toBeInTheDocument()
    // The middle items are replaced with a "..." indicator
    expect(screen.queryByText("B")).not.toBeInTheDocument()
  })
})

describe("Pagination", () => {
  it("calls onPageChange with the new page", async () => {
    const onPageChange = vi.fn()
    const user = userEvent.setup()
    render(<Pagination currentPage={3} totalPages={10} onPageChange={onPageChange} />)
    // Click "Next" button (the second nav button after the page numbers)
    const next = screen.getByRole("button", { name: "Next page" })
    await user.click(next)
    expect(onPageChange).toHaveBeenCalledWith(4)
  })

  it("disables the prev button on page 1 and next on the last page", () => {
    const { rerender } = render(
      <Pagination currentPage={1} totalPages={5} onPageChange={() => {}} />,
    )
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Next page" })).not.toBeDisabled()

    rerender(<Pagination currentPage={5} totalPages={5} onPageChange={() => {}} />)
    expect(screen.getByRole("button", { name: "Previous page" })).not.toBeDisabled()
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled()
  })

  it("renders compact mode with a page indicator", () => {
    render(<Pagination compact currentPage={2} totalPages={5} onPageChange={() => {}} />)
    expect(screen.getByText("Page 2 of 5")).toBeInTheDocument()
  })
})

describe("Tabs", () => {
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
    expect(screen.getByText("Overview content")).toBeInTheDocument()
    expect(screen.queryByText("Details content")).not.toBeInTheDocument()
    await user.click(screen.getByRole("tab", { name: "Details" }))
    expect(screen.getByText("Details content")).toBeInTheDocument()
  })
})
