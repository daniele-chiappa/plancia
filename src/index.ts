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
