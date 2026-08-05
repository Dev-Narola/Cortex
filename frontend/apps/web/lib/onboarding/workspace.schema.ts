/**
 * Workspace setup form schema — Zod.
 *
 * **F2 Part 2 (Task 14).** Validates the `POST /tenants`
 * request body for the onboarding flow.
 *
 * **Fields.**
 *   - `name` — friendly display name (e.g. "Acme Inc").
 *     Required, 3–100 chars.
 *   - `slug` — URL-friendly handle (e.g. "acme-inc").
 *     Required, lowercase + digits + hyphens, 2–63 chars
 *     (matches the backend's slug constraints).
 *
 * **Auto-slug from name.** The form calls `slugify(name)`
 * on every name change UNTIL the user manually edits the
 * slug field. Once the user touches the slug, the form
 * stops auto-syncing (so renaming the workspace doesn't
 * silently change the URL).
 *
 * **No logo / description / plan yet.** Per the spec,
 * "Future — Logo upload, Description, Plan Selection — should
 * not be added yet". The schema is shaped to extend
 * cleanly when those land.
 */

import { z } from "zod"

import { slugify } from "./slug"

const slugSchema = z
  .string()
  .trim()
  .min(2, "Slug must be at least 2 characters")
  .max(63, "Slug is too long (max 63 characters)")
  .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and dashes only")

export const workspaceSetupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Workspace name must be at least 3 characters")
    .max(100, "Workspace name is too long (max 100 characters)"),
  slug: slugSchema,
})

export type WorkspaceSetupInput = z.infer<typeof workspaceSetupSchema>

/**
 * Suggest a slug from a workspace name. Used by the form
 * to pre-fill the slug field until the user edits it.
 */
export function suggestSlug(name: string): string {
  return slugify(name)
}
