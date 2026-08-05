/**
 * Action icons — verbs the user takes.
 *
 * **F1 Part 4 (Task 34).** Subfolder index re-exporting
 * the curated list of action-icon names. App code never
 * imports from these subfolders directly (it goes through
 * `<Icon name="..." />`), but the per-category barrel exists
 * so:
 *
 *   - The folder structure mirrors the spec.
 *   - A linter / codemod can confirm every name used in the
 *     codebase is in the curated list.
 *   - A future icon-set swap only needs to update one file
 *     per category.
 *
 * See `../categories.ts` for the actual list. To preview
 * the names without digging in, read that file.
 */

export { ICON_ACTIONS } from "../categories"
