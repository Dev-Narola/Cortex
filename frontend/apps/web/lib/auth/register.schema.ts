/**
 * Register form schema — Zod.
 *
 * **F2 Part 1 (Task 4).** Validates the `POST /auth/register`
 * request body.
 *
 * **Fields.**
 *   - `name` — display name; trimmed; 1-100 chars.
 *   - `email` — RFC-5321-ish. Lowercased on the way in.
 *   - `password` — strength rules (see below).
 *   - `confirm_password` — must match `password`.
 *   - `accept_terms` — required to be `true` (the spec for
 *     F2 is "register" not "sign up to a mailing list"; the
 *     terms checkbox is required).
 *
 * **Password strength.** The backend owns the source of
 * truth, but the client-side rules surface a live strength
 * hint so the user doesn't have to round-trip. Rules:
 *   - At least 8 characters.
 *   - At least one lowercase, one uppercase, one digit.
 *   - (Optional special character — the backend accepts
 *     more lenient rules for v1.)
 *
 * **Password confirmation.** Validated *before* the API
 * request (per the spec: "Validate Password + Confirmation
 * Before API request").
 *
 * **Tenant creation.** Out of scope for F2 Part 1 — a
 * successful `POST /auth/register` returns the user record
 * + a default tenant. F2 Part 2 will add a separate
 * workspace-creation flow for invitations + multiple
 * workspaces per user.
 */

import { z } from "zod"

const passwordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .max(128, "Too long")
  .regex(/[a-z]/, "At least one lowercase letter")
  .regex(/[A-Z]/, "At least one uppercase letter")
  .regex(/[0-9]/, "At least one digit")

export const registerSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .min(1, "Email is required")
      .email("Enter a valid email address"),
    password: passwordSchema,
    confirm_password: z.string().min(1, "Confirm your password"),
    accept_terms: z.literal(true, {
      errorMap: () => ({ message: "You must accept the terms" }),
    }),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Passwords don't match",
    path: ["confirm_password"],
  })

export type RegisterInput = z.infer<typeof registerSchema>
