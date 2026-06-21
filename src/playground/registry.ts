import { markRaw } from 'vue'
import type { WindowRegistry } from '../index'
import DemoNote from './DemoNote.vue'
import DemoGraph from './DemoGraph.vue'
import DemoSettings from './DemoSettings.vue'

// In a real app these would be `defineAsyncComponent(() => import(...))` so heavy
// content (editors, graph canvases) is code-split per window type.
export const registry: WindowRegistry = {
  note: markRaw(DemoNote),
  graph: markRaw(DemoGraph),
  settings: markRaw(DemoSettings),
}
