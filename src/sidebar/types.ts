/**
 * Public types for the <PlanciaSidebar> component. Kept separate from the
 * window-manager types (`src/types.ts`) so the two component families stay
 * decoupled. Re-exported from the library barrel (`src/index.ts`).
 */

/** Edge the sidebar is anchored to. Drives the derived orientation. */
export type SidebarPosition = 'top' | 'bottom' | 'left' | 'right'

/** Derived from `position`: left/right are vertical, top/bottom horizontal. */
export type SidebarOrientation = 'vertical' | 'horizontal'

/**
 * How the sidebar relates to the sibling content.
 * - `inline`  — takes layout space; content reflows into the remainder (default).
 * - `overlay` — sits over the content, which keeps full size underneath.
 * - `floating`— like overlay but detached (margin, elevation, radius).
 */
export type SidebarMode = 'inline' | 'overlay' | 'floating'

/** Committed visibility state. `peek` is a transient hover preview, NOT a state. */
export type SidebarState = 'closed' | 'collapsed' | 'expanded'

/** Semantic events emitted by the controller / component. */
export type SidebarEventType =
  | 'open'
  | 'close'
  | 'collapse'
  | 'expand'
  | 'peek-start'
  | 'peek-end'
  | 'resize'

/** UI strings. All optional on the `labels` prop; merged over EN defaults. */
export interface SidebarLabels {
  expand: string
  collapse: string
  close: string
  open: string
  resize: string
  /** Fallback aria-label for the sidebar landmark when none is provided. */
  sidebar: string
}

export const DEFAULT_SIDEBAR_LABELS: SidebarLabels = {
  expand: 'Expand',
  collapse: 'Collapse',
  close: 'Close',
  open: 'Open',
  resize: 'Resize',
  sidebar: 'Sidebar',
}

/**
 * Payload passed to every sidebar slot (default/header/footer/collapsed). Carries
 * the current signal (state/orientation/mode/size) so content can adapt, plus
 * control handles so a toggle living in slot content can drive the sidebar.
 */
export interface SidebarSlotProps {
  state: SidebarState
  position: SidebarPosition
  orientation: SidebarOrientation
  mode: SidebarMode
  /** Current cross-axis size in px (width for vertical, height for horizontal). */
  size: number
  /** True while a transient hover preview is showing. */
  peeking: boolean
  /** True when expanded content should render (expanded OR peeking). */
  contentVisible: boolean
  expand: () => void
  collapse: () => void
  close: () => void
  open: () => void
  toggle: () => void
}
