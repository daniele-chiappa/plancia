/**
 * Injection contract between the manager and window content. A content
 * component (registered in the registry) calls `useOpenWindow()` to spawn
 * sibling windows without prop-drilling, exactly like the source apps did with
 * the injected `openWindow`.
 */
import { inject, type InjectionKey } from 'vue'
import type { OpenSpec } from '../types'

export const OPEN_WINDOW: InjectionKey<(spec: OpenSpec) => string> =
  Symbol('plancia.openWindow')
export const CAN_OPEN_TYPE: InjectionKey<(type: string) => boolean> =
  Symbol('plancia.canOpenWindowType')

/** Open a sibling window from within window content. Returns the window id
 *  (empty string if used outside a `<Plancia>`). */
export function useOpenWindow(): (spec: OpenSpec) => string {
  return inject(OPEN_WINDOW, () => '')
}

/** Whether a window type is registered in the host plancia (for gating
 *  clickable header tags / cross-window links). */
export function useCanOpenWindowType(): (type: string) => boolean {
  return inject(CAN_OPEN_TYPE, () => false)
}
