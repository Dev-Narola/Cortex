/**
 * Reset-password form schema — Zod.
 *
 * **F2 Part 1 (Task 4).** Validates the new-password
 * form on `/reset-password?token=...`.
 *
 * **Fields.**
 *   - `token` — the reset token from the URL query
 *     string. Required, non-empty.
 *   - `password` — same strength rules as register.
 *   - `confirm_password` — must match `password`.
 *
 * **Token validation placeholder.** The spec calls
 * for a "Token validation placeholder" — the actual
 * validity check happens on the backend (the client
 * can't tell whether a token is expired without a
 * round-trip). The form just checks "non-empty" here.
 * The real check is `POST /auth/reset-password` (the
 * `services/auth/reset.ts`).
 */

import { z } from "zod"

const passwordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .max(128, "Too long")
  .regex(/[a-z]/, "At least one lowercase letter")
  .regex(/[A-Z]/, "At least one uppercase letter")
  .regex(/[0-9]/, "At least one digit")

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Reset token is required"),
    password: passwordSchema,
    confirm_password: z.string().min(1, "Confirm your password"),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Passwords don't match",
    path: ["confirm_password"],
  })

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
