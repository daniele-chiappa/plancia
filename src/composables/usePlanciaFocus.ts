/**
 * Moves the focus into a window (F-03): onto the element the manager's
 * `focusTarget` selects in its body, such as the view's heading, or onto
 * the window itself when there is none. A screen reader then says which
 * window it is, and Tab goes on to its first control.
 *
 * Views loaded on demand draw their heading later: `wait` gives them that
 * long. The focus moves only if it is still where it was when the call was
 * made, or on the page once that element went, so a key pressed meanwhile
 * keeps it; and only the last call moves it.
 *
 * Callable from anywhere under the same Pinia (a menu, a palette, a bar
 * outside the manager): the selector comes from the windows store.
 */
import { useWindowsStore } from '../store/windows'

export interface FocusWindowOptions {
  /** How long (ms) to wait for the window and its target to be drawn.
   *  Default 0: they are looked up once, after the next render. */
  wait?: number
}

const STEP_MS = 50
// Only the last call moves the focus.
let pending = 0

export function usePlanciaFocus() {
  const store = useWindowsStore()

  /** Focuses window `id`; resolves true if the focus landed in it. */
  function focusWindow(id: string, options: FocusWindowOptions = {}): Promise<boolean> {
    const mine = ++pending
    const from = document.activeElement
    const until = Date.now() + (options.wait ?? 0)
    return new Promise((resolve) => {
      const tick = () => {
        if (mine !== pending) return resolve(false)
        const win = document.querySelector<HTMLElement>(`[data-win-id="${id}"]`)
        const body = win?.querySelector('.plancia-window__body')
        const target = store.focusTarget ? body?.querySelector<HTMLElement>(store.focusTarget) : null
        // Waits for the window, and for its target only if one is set.
        const ready = !!win && (!!target || !store.focusTarget)
        if (!ready && Date.now() < until) {
          setTimeout(tick, STEP_MS)
          return
        }
        const el = target ?? win
        const now = document.activeElement
        if (!el || (now !== from && now !== document.body && now !== null)) return resolve(false)
        el.focus({ preventScroll: true })
        resolve(document.activeElement === el)
      }
      setTimeout(tick, 0)
    })
  }

  return { focusWindow }
}
