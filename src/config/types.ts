/**
 * PlanciaConfig — a serializable, per-component configuration of appearance
 * (theme CSS vars) and behavior (a curated subset of prop defaults) + labels.
 * Applied by <PlanciaConfigProvider>; authorable as TS via `defineConfig`,
 * persisted as JSON. See ADR-003.
 */
import type { PlanciaLabels, ViewMode, WindowWidth } from '../types'
import type { SidebarLabels, SidebarMode, SidebarState } from '../sidebar/types'
import type { ModalLabels } from '../dialog/types'

/** Configurable behavior defaults (a curated subset of props) per family. */
export interface WindowConfigDefaults {
  widthCycle?: WindowWidth[]
  defaultWidth?: WindowWidth
  /** Minimum drag-resize width in px. Default 240. */
  minWidthPx?: number
  /** Dwell (ms) at the viewport-fit soft-max before a drag may exceed it.
   *  Default 300. */
  softMaxDelayMs?: number
  /** Initial layout mode when the manager is uncontrolled. Default 'strip'. */
  viewMode?: ViewMode
  /** In `tabs` mode, how many window subtrees to keep mounted (LRU). Default 5. */
  keepAliveMax?: number
}
export interface SidebarConfigDefaults {
  mode?: SidebarMode
  defaultState?: SidebarState
  responsive?: number | false
}
export interface ModalConfigDefaults {
  closeOnBackdrop?: boolean
  closeOnEsc?: boolean
}

export interface PlanciaConfig {
  meta?: { name?: string; version?: number }
  /** CSS custom-property values: `--plancia-*` → value (the `--` is optional). */
  theme?: Record<string, string>
  components?: {
    window?: { defaults?: WindowConfigDefaults; labels?: Partial<PlanciaLabels> }
    sidebar?: { defaults?: SidebarConfigDefaults; labels?: Partial<SidebarLabels> }
    dialog?: { defaults?: ModalConfigDefaults; labels?: Partial<ModalLabels> }
  }
}

/** Typed authoring helper (identity). Persist the result as JSON. */
export function defineConfig(config: PlanciaConfig): PlanciaConfig {
  return config
}
