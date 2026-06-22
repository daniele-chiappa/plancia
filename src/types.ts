import type { Component } from 'vue'

/** Step-width of a window in the strip. The actual pixel size is themeable via
 *  the `--plancia-w-{s,m}` CSS variables (`full` is always 100%). */
export type WindowWidth = 's' | 'm' | 'full'

/**
 * Header tag (reusable). Communicates "what this window is associated with".
 * When `open` is set the tag is clickable and opens that window — provided its
 * type is registered in the host plancia, otherwise it stays informational.
 */
export interface WindowTag {
  label: string
  /** Free tone key (usually a topic/module). Rendered as `data-tone` and,
   *  optionally, an extra class via the manager's `resolveTone` prop. */
  tone?: string
  /** Window to open on click. Absent → purely informational tag. */
  open?: OpenSpec
}

/** Request to open a window. */
export interface OpenSpec {
  type: string
  /** Logical de-dup key. Omitted → an auto key is generated. */
  key?: string
  title?: string
  props?: Record<string, unknown>
  tags?: WindowTag[]
  width?: WindowWidth
  /** Explicit pixel width. When set the window renders at these px (continuous
   *  drag-resize) instead of the `width` preset. */
  widthPx?: number
  /** If false, opens (right of focus) WITHOUT moving focus. Default true. */
  focus?: boolean
}

/** A live window in the plancia. */
export interface WindowInstance {
  id: string
  type: string
  /** Logical de-dup key (e.g. "anagrafica:12", "note:gosidian/hot.md"). */
  key: string
  title: string
  props: Record<string, unknown>
  /** Header tags (associations), updated by the content via the `tags` event. */
  tags: WindowTag[]
  width: WindowWidth
  /** Explicit pixel width from drag-resize. `null` ⇒ falls back to the `width`
   *  preset. Cleared (back to the preset) by `cycleWidth` / `resetWidth`. */
  widthPx?: number | null
  minimized: boolean
  dirty: boolean
}

/** Window-type → content component map passed to the manager. */
export type WindowRegistry = Record<string, Component>

/** UI strings. All optional on the `labels` prop; merged over EN defaults. */
export interface PlanciaLabels {
  empty: string
  openHint: string
  minimizedHint: (n: number) => string
  minimizedLabel: string
  unknownType: (type: string) => string
  resize: string
  /** Optional (added in 0.2.0) — falls back to the default, so adding it never
   *  breaks consumers that type a full `PlanciaLabels`. */
  resizeWidth?: string
  minimize: string
  close: string
  restore: string
  dirty: string
  unsavedClose: string
  openTag: string
}

export const DEFAULT_LABELS: Required<PlanciaLabels> = {
  empty: 'No window open.',
  openHint: 'Open one from the sidebar.',
  minimizedHint: (n) => `${n} minimized in the footer ↓`,
  minimizedLabel: 'Minimized:',
  unknownType: (type) => `Unknown window type: ${type}`,
  resize: 'Width (click to cycle)',
  resizeWidth: 'Resize width',
  minimize: 'Minimize',
  close: 'Close',
  restore: 'Restore',
  dirty: 'Unsaved changes',
  unsavedClose: 'There are unsaved changes. Close anyway?',
  openTag: 'Open',
}
