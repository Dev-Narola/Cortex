/**
 * Slug generator — workspace name → URL-friendly slug.
 *
 * **F2 Part 2 (Task 14).** The form auto-fills the slug
 * field from the workspace name until the user manually
 * edits it. The helper:
 *   - Lower-cases everything.
 *   - Replaces every non-`[a-z0-9]` character with `-`.
 *   - Collapses runs of `-` into a single `-`.
 *   - Trims leading + trailing `-`.
 *
 * **Why not just a regex replacement.** The naive
 * `name.toLowerCase().replace(/[^a-z0-9]/g, "-")` would
 * turn `Acme Workspace!!` into `acme--workspace--` —
 * double-dashes + trailing dashes. The collapse + trim
 * keeps the slug clean.
 *
 * **Why a custom function instead of a library.** A
 * single-purpose 10-line helper is easier to reason
 * about than `slugify@x.y.z`, and we control the exact
 * behaviour (e.g. a future i18n release might want to
 * transliterate accented characters first).
 */

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}
