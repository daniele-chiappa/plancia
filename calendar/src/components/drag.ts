import { ref, shallowRef, type Ref, type ShallowRef } from 'vue'
import type { Placed } from '../model/times'

/** Where a time is dragged to, as a view reads it from the element under the pointer. */
export interface DropTarget {
  day: string
  minute?: number
}

export interface DragOptions {
  enabled: () => boolean
  /** The target under the pointer, from the element there and the pointer's event. */
  target: (el: Element | null, ev: PointerEvent, grab: number) => DropTarget | null
  drop: (item: Placed, to: DropTarget) => void
}

export interface Drag {
  dragging: ShallowRef<Placed | null>
  over: Ref<DropTarget | null>
  start: (ev: PointerEvent, item: Placed) => void
  /** Says a click comes right after a drop, and is not one. */
  justDropped: () => boolean
}

/**
 * Drags a time with the pointer: past a few pixels it moves, and the view
 * says where it would go; letting go there moves it. The keyboard's way is
 * the form, where the days and hours are fields.
 */
export function useDrag(opts: DragOptions): Drag {
  const dragging = shallowRef<Placed | null>(null)
  const over = ref<DropTarget | null>(null)
  let dropped = 0

  function start(ev: PointerEvent, item: Placed) {
    if (!opts.enabled() || ev.button !== 0) return
    const el = ev.currentTarget as HTMLElement
    const x0 = ev.clientX
    const y0 = ev.clientY
    // Where the item was taken, from its top: a time keeps it under the pointer.
    const grab = ev.clientY - el.getBoundingClientRect().top
    let moving = false
    const move = (e: PointerEvent) => {
      if (!moving && Math.hypot(e.clientX - x0, e.clientY - y0) < 5) return
      if (!moving) {
        moving = true
        dragging.value = item
      }
      const under = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(e.clientX, e.clientY) : null
      over.value = opts.target(under, e, grab)
    }
    const end = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', cancel)
      const to = over.value
      const was = moving
      dragging.value = null
      over.value = null
      if (was) {
        dropped = Date.now()
        if (to) opts.drop(item, to)
      }
    }
    const cancel = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', cancel)
      dragging.value = null
      over.value = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', cancel)
  }

  return { dragging, over, start, justDropped: () => Date.now() - dropped < 300 }
}
