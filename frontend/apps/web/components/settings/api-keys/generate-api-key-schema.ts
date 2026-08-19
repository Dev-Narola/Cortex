/**
 * Generate API Key — Zod schema + inferred types.
 *
 * **F7 Part 2 (Task 12).** The form schema is
 * the contract the modal enforces client-side.
 * The backend's `CreateApiKeyRequest` accepts
 * `name` (1-255 chars) and `scopes` (default
 * `[]`); the schema mirrors the user-facing
 * subset.
 *
 * **Why Zod.** F0–F6 + F7 Part 1 all use Zod
 * schemas; this is the project's form
 * convention.
 *
 * **Length cap.** The backend caps at 255. We
 * mirror the cap client-side so the user gets
 * an immediate error instead of a 422 round-trip
 * on submit.
 */
import { z } from "zod"

export const generateApiKeySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: "Name is required" })
    .max(255, { message: "Name must be 255 characters or fewer" }),
})

export type GenerateApiKeyFormValues = z.infer<typeof generateApiKeySchema>
