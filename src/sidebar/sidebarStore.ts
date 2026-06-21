/**
 * Optional global store for sidebar state, keyed by a logical id. Strictly
 * opt-in: <PlanciaSidebar> is fully usable without it (uncontrolled, or via
 * `v-model` / `usePlanciaSidebar`). Reach for this only when several parts of
 * the app must read or drive the same sidebar; bind an entry through v-model:
 *
 *   const sb = usePlanciaSidebarStore()
 *   const main = sb.entry('main', { state: 'collapsed' })
 *   // <PlanciaSidebar v-model:state="main.state" v-model:size="main.size" />
 *
 * The component's controller still owns the transition semantics; this store is
 * just the shared, persistable source of truth bound via v-model.
 */
import { reactive } from 'vue'
import { defineStore } from 'pinia'
import { DEFAULT_EXPANDED_SIZE } from './useSidebarController'
import type { SidebarState } from './types'

export interface SidebarStoreEntry {
  state: SidebarState
  size: number
}

export const usePlanciaSidebarStore = defineStore('plancia-sidebar', () => {
  const bars = reactive<Record<string, SidebarStoreEntry>>({})

  /** Get (creating on first use) the reactive entry for a sidebar id. */
  function entry(id: string, init?: Partial<SidebarStoreEntry>): SidebarStoreEntry {
    if (!bars[id]) {
      bars[id] = {
        state: init?.state ?? 'expanded',
        size: init?.size ?? DEFAULT_EXPANDED_SIZE,
      }
    }
    return bars[id]!
  }
  function set(id: string, state: SidebarState): void {
    entry(id).state = state
  }
  function setSize(id: string, size: number): void {
    entry(id).size = size
  }
  /** Convenience for an external toggle button: expanded ⇄ collapsed. */
  function toggle(id: string): void {
    const e = entry(id)
    e.state = e.state === 'expanded' ? 'collapsed' : 'expanded'
  }

  return { bars, entry, set, setSize, toggle }
})
