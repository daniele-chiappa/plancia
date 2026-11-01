// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, markRaw, onMounted, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import Plancia from '../components/Plancia.vue'
import { useWindowsStore } from '../store/windows'
import { usePlanciaFocus } from './usePlanciaFocus'

// jsdom doesn't implement scrollIntoView (Plancia scrolls the focused window).
Element.prototype.scrollIntoView = () => {}

enableAutoUnmount(afterEach)

/** A view that draws its heading `late` ms after it mounts (never if < 0),
 *  as a view loaded on demand does. */
const View = markRaw(
  defineComponent({
    props: { late: { type: Number, default: 0 } },
    setup(props) {
      const drawn = ref(false)
      onMounted(() => {
        if (props.late >= 0) setTimeout(() => (drawn.value = true), props.late)
      })
      return () =>
        h('div', [
          h('button', { class: 'inner' }, 'act'),
          drawn.value ? h('h2', { 'data-heading': '', tabindex: -1 }, 'Title') : null,
        ])
    },
  }),
)

let pinia: ReturnType<typeof createPinia>
beforeEach(() => {
  vi.useFakeTimers()
  pinia = createPinia()
  setActivePinia(pinia)
})
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

function setup(focusTarget?: string) {
  const outside = document.createElement('button')
  outside.textContent = 'outside'
  document.body.append(outside)
  mount(Plancia, {
    props: { registry: { v: View }, focusTarget },
    global: { plugins: [pinia] },
    attachTo: document.body,
  })
  const store = useWindowsStore()
  const open = (key: string, late: number) => store.open({ type: 'v', key, title: key, props: { late } })
  const section = (id: string) => document.querySelector(`[data-win-id="${id}"]`)
  return { outside, open, section, focusWindow: usePlanciaFocus().focusWindow }
}

describe('usePlanciaFocus — focusWindow (F-03)', () => {
  it('focuses the target in the window, once its view draws it', async () => {
    const { outside, open, focusWindow } = setup('[data-heading]')
    outside.focus()
    const done = focusWindow(open('a', 100), { wait: 1000 })
    await vi.advanceTimersByTimeAsync(50)
    expect(document.activeElement).toBe(outside)
    await vi.advanceTimersByTimeAsync(100)
    expect(document.activeElement?.textContent).toBe('Title')
    await expect(done).resolves.toBe(true)
  })

  it('searches the window body only, not its title bar', async () => {
    const { open, focusWindow } = setup('button')
    void focusWindow(open('a', 0))
    await vi.advanceTimersByTimeAsync(0)
    expect(document.activeElement?.className).toBe('inner')
  })

  it('focuses the window itself without a target', async () => {
    const { open, section, focusWindow } = setup()
    const id = open('a', 0)
    const done = focusWindow(id)
    await vi.advanceTimersByTimeAsync(0)
    expect(document.activeElement).toBe(section(id))
    await expect(done).resolves.toBe(true)
  })

  it('without a target set, focuses the window at once, whatever the wait', async () => {
    const { open, section, focusWindow } = setup()
    const id = open('a', 0)
    void focusWindow(id, { wait: 1000 })
    await vi.advanceTimersByTimeAsync(0)
    expect(document.activeElement).toBe(section(id))
  })

  it('falls back to the window itself when the target never comes', async () => {
    const { open, section, focusWindow } = setup('[data-heading]')
    const id = open('a', -1)
    void focusWindow(id, { wait: 300 })
    await vi.advanceTimersByTimeAsync(200)
    expect(document.activeElement).toBe(document.body)
    await vi.advanceTimersByTimeAsync(200)
    expect(document.activeElement).toBe(section(id))
  })

  it('leaves the focus where a key moved it meanwhile', async () => {
    const { outside, open, focusWindow } = setup('[data-heading]')
    const done = focusWindow(open('a', 100), { wait: 1000 })
    outside.focus()
    await vi.advanceTimersByTimeAsync(200)
    expect(document.activeElement).toBe(outside)
    await expect(done).resolves.toBe(false)
  })

  it('takes the focus from the page once the opener went', async () => {
    const { outside, open, focusWindow } = setup('[data-heading]')
    outside.focus()
    const done = focusWindow(open('a', 100), { wait: 1000 })
    outside.remove()
    await vi.advanceTimersByTimeAsync(200)
    expect(document.activeElement?.textContent).toBe('Title')
    await expect(done).resolves.toBe(true)
  })

  it('only the last call moves the focus', async () => {
    const { open, section, focusWindow } = setup('[data-heading]')
    const a = open('a', 100)
    const b = open('b', 0)
    const first = focusWindow(a, { wait: 1000 })
    void focusWindow(b)
    await vi.advanceTimersByTimeAsync(200)
    expect(section(b)?.contains(document.activeElement)).toBe(true)
    await expect(first).resolves.toBe(false)
  })
})
