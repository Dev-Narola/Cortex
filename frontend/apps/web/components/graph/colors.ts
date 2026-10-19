/**
 * Graph colours shared by the 3D scene and the 2D fallback (kept free of
 * three.js imports so the 2D bundle stays light). Entity types get the
 * supporting accents, a real distinction; orange is reserved for the
 * selection and the traced path. Values work on both themes.
 */

export const TYPE_COLORS = [
  "#2c9c85",
  "#4f86d0",
  "#8b6fd6",
  "#9ab52e",
  "#c2853a",
  "#5f9ea0",
] as const
export const SELECTED_COLOR = "#ff914d"
export const ACTIVE_PATH_COLOR = "#f47732"

/** Stable colour per entity type (case-insensitive). */
export function typeColorFor(type: string | undefined): string {
  const key = (type ?? "").toLowerCase()
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return TYPE_COLORS[h % TYPE_COLORS.length] ?? TYPE_COLORS[0]
}
