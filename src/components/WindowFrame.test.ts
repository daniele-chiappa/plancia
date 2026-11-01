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

describe('WindowFrame as a focus point (F-03)', () => {
  /** The accessible name given by aria-labelledby, resolved in the frame. */
  const nameOf = (section: Element) =>
    (section.getAttribute('aria-labelledby') ?? '')
      .split(' ')
      .filter(Boolean)
      .map((id) => section.querySelector(`[id="${id}"]`)?.textContent?.trim())
      .join(' ')

  it('is named by its title, without the unsaved mark, and can take the focus', () => {
    const win = openWin()
    store.setTitle(win.id, 'Note')
    store.setDirty(win.id, true)
    const section = mountFrame(win).get('section').element
    expect(nameOf(section)).toBe('Note')
    expect(section.getAttribute('tabindex')).toBe('-1')
  })

  it('a foreign window is named with its module too', () => {
    const win = openWin()
    store.setTitle(win.id, 'Note')
    const w = mountFrame(win, { foreignLabel: 'Products' })
    expect(nameOf(w.get('section').element)).toBe('Products Note')
  })

  it('keeps the spaces of the title bar between module, title and unsaved mark', () => {
    const win = openWin()
    store.setTitle(win.id, 'Note')
    store.setDirty(win.id, true)
    const w = mountFrame(win, { foreignLabel: 'Products' })
    expect(w.get('.plancia-window__title').element.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Products Note •',
    )
  })

  it('a focus that enters the window makes it the focused one', async () => {
    const first = store.open({ type: 't', key: 'a' })
    store.open({ type: 't', key: 'b' }) // takes the focus
    const w = mountFrame(store._byId(first)!)
    w.get('button').element.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    await nextTick()
    expect(store.focusedId).toBe(first)
  })
})
