/**
 * Login form schema validation.
 *
 * The schema lives inline in the page component; we mirror
 * the rules here so the contract is unit-testable in isolation.
 * (The page itself is covered by the e2e test.)
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";

const schema = z.object({
  tenant_slug: z
    .string()
    .min(2, "Workspace slug is required")
    .max(63, "Workspace slug is too long")
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and dashes only"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

describe("login schema", () => {
  it("accepts a valid payload", () => {
    const result = schema.safeParse({
      tenant_slug: "acme",
      email: "owner@acme.com",
      password: "TestPass!2345",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty tenant_slug", () => {
    const result = schema.safeParse({
      tenant_slug: "",
      email: "owner@acme.com",
      password: "TestPass!2345",
    });
    expect(result.success).toBe(false);
  });

  it("rejects uppercase / special chars in tenant_slug", () => {
    const result = schema.safeParse({
      tenant_slug: "Acme_Corp",
      email: "owner@acme.com",
      password: "TestPass!2345",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = schema.safeParse({
      tenant_slug: "acme",
      email: "not-an-email",
      password: "TestPass!2345",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty password", () => {
    const result = schema.safeParse({
      tenant_slug: "acme",
      email: "owner@acme.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a long-ish password (only min length is 1)", () => {
    const result = schema.safeParse({
      tenant_slug: "acme",
      email: "owner@acme.com",
      password: "x",
    });
    expect(result.success).toBe(true);
  });
});
