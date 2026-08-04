/**
 * Drawer — unit tests.
 *
 * F1 Part 3 (Task 23).
 *
 * **Scope.** Render + side axis. The swipe-ready
 * transforms are exercised in e2e (Playwright).
 */

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "./Drawer"

function ControlledDrawer({ side }: { side: "left" | "right" | "top" | "bottom" }) {
  return (
    <Drawer>
      <DrawerTrigger>Open</DrawerTrigger>
      <DrawerContent side={side} data-testid="drawer-content">
        <DrawerHeader>
          <DrawerTitle>Side sheet</DrawerTitle>
          <DrawerDescription>Quick panel</DrawerDescription>
        </DrawerHeader>
        <DrawerBody>Body content</DrawerBody>
        <DrawerFooter>
          <DrawerClose>Close</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

describe("Drawer", () => {
  it("renders the trigger but not the panel until opened", () => {
    render(<ControlledDrawer side="right" />)
    expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("renders a trigger for every side value without crashing", () => {
    // We don't assert a count because `rerender` replaces the DOM —
    // we just verify each side variant mounts cleanly.
    const sides: Array<"left" | "right" | "top" | "bottom"> = ["right", "left", "top", "bottom"]
    for (const side of sides) {
      const { unmount } = render(<ControlledDrawer side={side} />)
      expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument()
      unmount()
    }
  })

  it("compound sub-parts are exported", () => {
    expect(DrawerHeader).toBeDefined()
    expect(DrawerTitle).toBeDefined()
    expect(DrawerDescription).toBeDefined()
    expect(DrawerBody).toBeDefined()
    expect(DrawerFooter).toBeDefined()
    expect(DrawerClose).toBeDefined()
    expect(DrawerTrigger).toBeDefined()
  })
})
