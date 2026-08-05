/**
 * Login form schema — Zod.
 *
 * **F2 Part 1 (Task 4).** Validates the `POST /auth/login`
 * request body. Lives in `lib/auth/` (Zod is a form
 * concern, not a UI concern; `components/auth/` consumes
 * it via React Hook Form's `zodResolver`).
 *
 * **Fields.**
 *   - `tenant_slug` — the workspace the user is signing in
 *     under. Users may belong to multiple tenants; the slug
 *     is the disambiguator.
 *   - `email` — RFC-5321-ish (Zod's `.email()` is pragmatic).
 *   - `password` — never validated client-side beyond
 *     "non-empty". The backend applies the strength policy.
 *
 * **Why lowercase the tenant slug.** The backend normalises
 * tenant slugs to lowercase, so we lowercase on the way in
 * to give a sensible "you typed `Acme`, did you mean `acme`?"
 * error before the round-trip.
 */

import { z } from "zod"

export const loginSchema = z.object({
  tenant_slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Workspace slug is required")
    .max(63, "Workspace slug is too long")
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and dashes only"),
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
})

export type LoginInput = z.infer<typeof loginSchema>
