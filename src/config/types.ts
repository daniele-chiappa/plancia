/**
 * PlanciaConfig — a serializable, per-component configuration of appearance
 * (theme CSS vars) and behavior (a curated subset of prop defaults) + labels.
 * Applied by <PlanciaConfigProvider>; authorable as TS via `defineConfig`,
 * persisted as JSON. See ADR-003.
 */
import type { PlanciaLabels, WindowWidth } from '../types'
import type { SidebarLabels, SidebarMode, SidebarState } from '../sidebar/types'
import type { ModalLabels } from '../dialog/types'

/** Configurable behavior defaults (a curated subset of props) per family. */
export interface WindowConfigDefaults {
  widthCycle?: WindowWidth[]
  defaultWidth?: WindowWidth
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
