/**
 * Forgot-password form schema — Zod.
 *
 * **F2 Part 1 (Task 4).** Validates the email-only
 * "send me a reset link" form. Per the spec: "Email
 * Only".
 *
 * **No password.** The reset link in the email carries
 * a token; the actual password is set on the
 * `/reset-password` route.
 *
 * **Email-only.** The backend always returns 200 for
 * a valid email, regardless of whether the address
 * exists — to avoid leaking which accounts are
 * registered. The client treats the request as
 * fire-and-forget; the success message says
 * "If an account exists for ... we sent a link".
 */

import { z } from "zod"

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
})

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
