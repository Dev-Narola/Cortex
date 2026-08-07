/**
 * Upload validation — the source of truth for what
 * the user is allowed to submit.
 *
 * **F3 Part 3 (Task 23).** Every rule enforced by
 * the backend (`application/services.py`) is mirrored
 * here so the user gets an instant error message
 * instead of a round-trip. The backend remains the
 * final authority; this layer is a UX layer, not a
 * security layer.
 *
 * **File rules.**
 *   - Required (we surface the standard Zod message).
 *   - Extension is in the backend allowlist
 *     (`pdf`, `docx`, `txt`, `md`).
 *   - Size capped at 50 MB — matches the S3 multipart
 *     limit + the V1 ingestion cap.
 *
 * **URL rules.**
 *   - Required.
 *   - Must parse as a URL.
 *   - Protocol must be `https:` (the backend fetches
 *     over TLS; the upload-via-URL flow is the same).
 *   - **The current backend does NOT expose a URL
 *     ingestion endpoint.** The URL tab is a future
 *     hook; the form is validated so when the backend
 *     catches up the same schema works.
 *
 * **Why two separate schemas, not one.** The tabs
 * surface different fields (file vs URL string), and
 * surfacing the per-field error is the whole point.
 * A single union with `discriminatedUnion` would lose
 * the per-tab focus state.
 */

import { z } from "zod"

/** Backend allowlist (mirrors `application/services.py`). */
export const ALLOWED_EXTENSIONS = ["pdf", "docx", "txt", "md"] as const

/** Backend size limit. 50 MB. */
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024

/** Friendly "X MB" copy for the UI. */
export const MAX_FILE_SIZE_LABEL = "50 MB"

/** Single shared file validator. */
const fileSchema = z
  .custom<File>((v) => v instanceof File, {
    message: "Please choose a file to upload.",
  })
  .refine((file) => file.size > 0, {
    message: "That file is empty.",
  })
  .refine((file) => file.size <= MAX_FILE_SIZE_BYTES, {
    message: `File is too large. The limit is ${MAX_FILE_SIZE_LABEL}.`,
  })
  .refine((file) => {
    const ext = file.name.split(".").pop()?.toLowerCase()
    return ext ? (ALLOWED_EXTENSIONS as readonly string[]).includes(ext) : false
  }, {
    message: `Unsupported file type. Allowed: ${ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(", ")}.`,
  })

/** File-tab form. */
export const fileUploadSchema = z.object({
  kind: z.literal("file"),
  file: fileSchema,
})

/** URL-tab form. */
export const urlUploadSchema = z.object({
  kind: z.literal("url"),
  url: z
    .string({ message: "Please enter a URL." })
    .trim()
    .min(1, "Please enter a URL.")
    .url("That doesn't look like a valid URL.")
    .refine(
      (raw) => {
        try {
          return new URL(raw).protocol === "https:"
        } catch {
          return false
        }
      },
      { message: "URLs must use https://" },
    ),
})

/** Discriminated union — the upload modal picks the
 *  right shape based on the active tab. */
export const uploadSchema = z.discriminatedUnion("kind", [
  fileUploadSchema,
  urlUploadSchema,
])

export type FileUploadForm = z.infer<typeof fileUploadSchema>
export type UrlUploadForm = z.infer<typeof urlUploadSchema>
export type UploadForm = z.infer<typeof uploadSchema>
