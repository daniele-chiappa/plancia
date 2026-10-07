// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import WindowFrame from './WindowFrame.vue'
import { useWindowsStore } from '../store/windows'
import { DEFAULT_LABELS } from '../types'

// trigger() builds the event and then assigns clientX & co. to it, which
// jsdom's PointerEvent (read-only coordinates) rejects: dispatch one built
// with its init dict instead.
async function pointerDown(el: { element: Element }, init: PointerEventInit) {
  el.element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, ...init }))
  await nextTick()
}

let pinia: ReturnType<typeof createPinia>
let store: ReturnType<typeof useWindowsStore>
beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  store = useWindowsStore()
})

/** Open a real window in the store and return its reactive instance, so that
 *  the store actions invoked by the component mutate the same object. */
function openWin(over: { width?: 's' | 'm' | 'full'; widthPx?: number } = {}) {
  const id = store.open({ type: 't', key: 'k', width: over.width, widthPx: over.widthPx })
  return store._byId(id)!
}

function mountFrame(win: ReturnType<typeof openWin>, props: Record<string, unknown> = {}) {
  return mount(WindowFrame, {
    props: { win, labels: DEFAULT_LABELS, maxVisiblePx: 800, minWidthPx: 240, ...props },
    global: { plugins: [pinia] },
  })
}

describe('WindowFrame drag-resize', () => {
  it('exposes a right-edge separator handle with ARIA', () => {
    const w = mountFrame(openWin())
    const handle = w.get('.plancia-window__resize')
    expect(handle.attributes('role')).toBe('separator')
    expect(handle.attributes('aria-orientation')).toBe('vertical')
    expect(handle.attributes('aria-label')).toBe('Resize width')
    expect(handle.attributes('aria-valuemin')).toBe('240')
  })

  it('renders --plancia-window-w only when widthPx is set', async () => {
    const win = openWin()
    const w = mountFrame(win)
    expect(w.get('section').attributes('style') ?? '').not.toContain('--plancia-window-w')
    store.setWidthPx(win.id, 600)
    await nextTick()
    expect(w.get('section').attributes('style')).toContain('--plancia-window-w: 600px')
  })

  it('a pointer drag pins, then updates the px width via the store', async () => {
    const win = openWin()
    const w = mountFrame(win)
    const handle = w.get('.plancia-window__resize')

    // pointerdown pins the currently-rendered width (0 in jsdom → rounded to 0).
    await pointerDown(handle, { clientX: 100, button: 0, pointerId: 1 })
    expect(win.widthPx).not.toBeNull()

    // drag right to a candidate inside [min=240, softMax=800].
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 600 }))
    await nextTick()
    // startWidth(≈0) + (600 - 100) = 500, within the visible band.
    expect(win.widthPx).toBe(500)
    expect(w.get('section').attributes('data-resize-phase')).toBe('normal')

    window.dispatchEvent(new MouseEvent('pointerup'))
    await nextTick()
    expect(w.get('section').attributes('data-resize-phase')).toBe('normal')
  })

  it('holds at the soft-max and signals, then unlocks beyond after the dwell', async () => {
    vi.useFakeTimers()
    const win = openWin()
    const w = mountFrame(win, { maxVisiblePx: 500, softMaxDelayMs: 300 })
    const handle = w.get('.plancia-window__resize')

    await pointerDown(handle, { clientX: 0, button: 0, pointerId: 1 })
    // pinned at ~0; drag way past 500 → held + signaling
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 900 }))
    await nextTick()
    expect(win.widthPx).toBe(500)
    expect(w.get('section').attributes('data-resize-phase')).toBe('signaling')

    // after the dwell fires it unlocks past the viewport.
    vi.advanceTimersByTime(300)
    await nextTick()
    expect(w.get('section').attributes('data-resize-phase')).toBe('beyond')
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 900 }))
    await nextTick()
    expect(win.widthPx).toBe(900)

    window.dispatchEvent(new MouseEvent('pointerup'))
    vi.useRealTimers()
  })

  it('Arrow keys step the width; Home resets to the preset', async () => {
    const win = openWin({ widthPx: 400 })
    const w = mountFrame(win)
    const handle = w.get('.plancia-window__resize')

    await handle.trigger('keydown', { key: 'ArrowRight' })
    expect(win.widthPx).toBe(424) // +24
    await handle.trigger('keydown', { key: 'ArrowLeft', shiftKey: true })
    expect(win.widthPx).toBe(360) // -64
    await handle.trigger('keydown', { key: 'Home' })
    expect(win.widthPx).toBeNull()
  })

  it('double-click on the handle clears the px width (resetWidth)', async () => {
    const win = openWin({ widthPx: 700 })
    const w = mountFrame(win)
    await w.get('.plancia-window__resize').trigger('dblclick')
    expect(win.widthPx).toBeNull()
  })
})
