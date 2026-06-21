// Public API barrel for the plancia library.
// Consumers: `import { Plancia, useWindowsStore } from 'plancia'`
export { default as Plancia } from './Plancia.vue'
export { useWindowsStore, WIDTH_CYCLE } from './store/windows'
export type {
  WindowWidth,
  WindowTag,
  WindowInstance,
  OpenSpec,
} from './store/windows'
