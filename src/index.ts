// Public API barrel for the plancia library.
// Consumers: `import { Plancia, useWindowsStore } from 'plancia'`
//            `import 'plancia/style.css'`
export { default as Plancia } from './components/Plancia.vue'
export { default as WindowFrame } from './components/WindowFrame.vue'

export { useWindowsStore, DEFAULT_WIDTH_CYCLE, DEFAULT_WIDTH } from './store/windows'
export type { PlanciaConfig } from './store/windows'

export {
  useOpenWindow,
  useCanOpenWindowType,
  OPEN_WINDOW,
  CAN_OPEN_TYPE,
} from './composables/openWindow'

export { usePlanciaSync, createArgCodec } from './composables/usePlanciaSync'
export type {
  PlanciaCodec,
  PlanciaSyncOptions,
  ArgCodecConfig,
  ArgTypeSpec,
} from './composables/usePlanciaSync'

export { DEFAULT_LABELS } from './types'
export type {
  WindowWidth,
  WindowTag,
  WindowInstance,
  OpenSpec,
  WindowRegistry,
  PlanciaLabels,
} from './types'

// --- sidebar ---------------------------------------------------------------
export { default as PlanciaSidebar } from './components/PlanciaSidebar.vue'
export { default as PlanciaLayout } from './components/PlanciaLayout.vue'

export {
  useSidebarController,
  DEFAULT_EXPANDED_SIZE,
  DEFAULT_MIN_SIZE,
  DEFAULT_MAX_SIZE,
} from './sidebar/useSidebarController'
export type { SidebarController, SidebarControllerOptions } from './sidebar/useSidebarController'

export { usePlanciaSidebar, SIDEBAR_CONTROL } from './sidebar/usePlanciaSidebar'
export type { SidebarControl } from './sidebar/usePlanciaSidebar'

export { usePlanciaSidebarStore } from './sidebar/sidebarStore'
export type { SidebarStoreEntry } from './sidebar/sidebarStore'

export { DEFAULT_SIDEBAR_LABELS } from './sidebar/types'
export type {
  SidebarPosition,
  SidebarOrientation,
  SidebarMode,
  SidebarState,
  SidebarEventType,
  SidebarLabels,
  SidebarSlotProps,
} from './sidebar/types'
