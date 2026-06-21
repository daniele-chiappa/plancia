/**
 * Injection contract for <PlanciaSidebar>, mirroring the window-manager's
 * `useOpenWindow`. A control (toggle/close/resize button) living anywhere inside
 * the sidebar's slot content can drive the sidebar without prop-drilling.
 *
 * The optional Pinia store lives in `./sidebarStore` and is wired separately
 * (Phase 5); this file only carries the provide/inject channel so the component
 * and slot content can talk.
 */
import { inject, type ComputedRef, type InjectionKey, type Ref } from 'vue'
import type {
  SidebarMode,
  SidebarOrientation,
  SidebarPosition,
  SidebarState,
} from './types'

/** Reactive handle to the nearest enclosing sidebar. */
export interface SidebarControl {
  state: ComputedRef<SidebarState>
  size: ComputedRef<number>
  orientation: ComputedRef<SidebarOrientation>
  position: ComputedRef<SidebarPosition>
  mode: ComputedRef<SidebarMode>
  peeking: Ref<boolean>
  /** True when expanded content is showing (expanded OR peeking). */
  contentVisible: ComputedRef<boolean>
  expand: () => void
  collapse: () => void
  close: () => void
  open: () => void
  toggle: () => void
  setSize: (px: number) => void
}

export const SIDEBAR_CONTROL: InjectionKey<SidebarControl> = Symbol('plancia.sidebar')

/**
 * Access the enclosing sidebar's controls from within its slot content. Returns
 * `null` when used outside a `<PlanciaSidebar>`.
 */
export function usePlanciaSidebar(): SidebarControl | null {
  return inject(SIDEBAR_CONTROL, null)
}
