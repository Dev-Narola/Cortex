import { describe, expect, it } from "vitest"

import { formatRelative } from "@/lib/utils/date"

describe("formatRelative", () => {
  const now = new Date("2026-10-18T12:00:00Z")

  it("describes past timestamps as 'ago'", () => {
    expect(formatRelative("2026-10-18T11:55:00Z", now)).toBe("5 minutes ago")
    expect(formatRelative("2026-10-17T12:00:00Z", now)).toBe("yesterday")
  })

  it("describes future timestamps with 'in'", () => {
    expect(formatRelative("2026-10-18T14:00:00Z", now)).toBe("in 2 hours")
  })

  it("returns an em dash for invalid input", () => {
    expect(formatRelative("not a date", now)).toBe("—")
  })
})
