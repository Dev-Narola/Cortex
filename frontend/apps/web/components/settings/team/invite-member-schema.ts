/**
 * Invite Member — Zod schema + inferred types.
 *
 * **F7 Part 1 (Tasks 22, 23, 24).** The form schema
 * is the contract the modal enforces client-side.
 * The backend may apply stricter rules; the
 * frontend schema is the "user-friendly" subset.
 *
 * **Why Zod over a hand-rolled validator.** Zod
 * is the project's form-validation library
 * (per the Frontend Roadmap: "React Hook Form +
 * Zod"). The schema is the single source of truth
 * for both validation and the inferred TypeScript
 * type — no parallel `interface` to drift.
 *
 * **Email validation.** RFC 5321 is a long
 * document; the Zod `.email()` validator applies
 * the common subset (local@domain.tld). Backend
 * may apply additional rules (e.g. block-list
 * of disposable domains); those are the
 * backend's problem and surface as a 422.
 *
 * **Role validation.** The PRD is explicit:
 * the invite selector exposes `admin` / `member`
 * / `viewer`. `owner` is set at tenant creation
 * and not through the invite form. The schema
 * pins the three allowed values.
 */
import { z } from "zod"

export const INVITABLE_ROLES = ["admin", "member", "viewer"] as const

export const inviteMemberSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, { message: "Email is required" })
    .email({ message: "Enter a valid email address" }),
  role: z.enum(INVITABLE_ROLES, {
    errorMap: () => ({ message: "Choose a role for the new member" }),
  }),
})

export type InviteMemberFormValues = z.infer<typeof inviteMemberSchema>
