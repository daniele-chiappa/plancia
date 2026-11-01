// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, markRaw } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import Plancia from './Plancia.vue'
import { useOpenWindow } from '../composables/openWindow'
import { useWindowsStore } from '../store/windows'

// jsdom doesn't implement scrollIntoView (Plancia scrolls the focused window).
Element.prototype.scrollIntoView = () => {}

const registry = { x: markRaw(defineComponent({ render: () => h('div', { class: 'winbody' }, 'hi') })) }

let pinia: ReturnType<typeof createPinia>
beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
})

function mountPlancia(slots: Record<string, (...args: unknown[]) => unknown>) {
  return mount(Plancia, { props: { registry }, slots, global: { plugins: [pinia] } })
}

describe('Plancia edge sidebar slots', () => {
  it('renders left/right sidebar slots inside the middle band, around the main column', () => {
    const w = mountPlancia({
      'sidebar-left': () => h('div', { class: 'sb-l' }, 'L'),
      'sidebar-right': () => h('div', { class: 'sb-r' }, 'R'),
    })
    const kids = Array.from(w.get('.plancia__mid').element.children).map((c) => c.className)
    expect(kids[0]).toContain('sb-l')
    expect(kids[kids.length - 1]).toContain('sb-r')
    expect(kids).toContain('plancia__main')
  })

  it('renders top/bottom slots as full-width children of .plancia', () => {
    const w = mountPlancia({
      'sidebar-top': () => h('div', { class: 'sb-t' }, 'T'),
      'sidebar-bottom': () => h('div', { class: 'sb-b' }, 'B'),
    })
    expect(w.find('.plancia > .sb-t').exists()).toBe(true)
    expect(w.find('.plancia > .sb-b').exists()).toBe(true)
  })

  it('lets a menu in the sidebar slot open windows via useOpenWindow', async () => {
    const Menu = defineComponent({
      setup() {
        const open = useOpenWindow()
        return () =>
          h('button', { class: 'open-x', onClick: () => open({ type: 'x', key: 'k' }) }, 'open')
      },
    })
    const w = mountPlancia({ 'sidebar-left': () => h(Menu) })
    expect(w.find('.plancia-window').exists()).toBe(false)
    await w.get('.open-x').trigger('click')
    expect(w.find('.plancia-window').exists()).toBe(true)
    expect(w.find('.winbody').exists()).toBe(true)
  })

  it('keeps the plain strip layout when no sidebar slots are used', () => {
    const w = mountPlancia({})
    expect(w.find('.plancia__mid > .plancia__main > .plancia__strip').exists()).toBe(true)
  })
})

function mountMode(viewMode: 'strip' | 'tabs') {
  return mount(Plancia, { props: { registry, viewMode }, global: { plugins: [pinia] } })
}

describe('Plancia view mode (strip ↔ tabs)', () => {
  it('renders a tab bar with one tab (title + close) per visible window in tabs mode', () => {
    const store = useWindowsStore()
    store.open({ type: 'x', key: 'a', title: 'Alpha' })
    store.open({ type: 'x', key: 'b', title: 'Beta' })
    const w = mountMode('tabs')
    expect(w.find('.plancia__strip').exists()).toBe(false)
    expect(w.find('.plancia__tabbar').exists()).toBe(true)
    const tabs = w.findAll('.plancia__tab')
    expect(tabs).toHaveLength(2)
    expect(tabs[0]!.find('.plancia__tab-text').text()).toBe('Alpha')
    expect(tabs[1]!.find('.plancia__tab-text').text()).toBe('Beta')
    expect(tabs[0]!.find('.plancia__tab-close').exists()).toBe(true)
  })

  it('mounts only the focused window in tabs, but all visible windows in strip', () => {
    const store = useWindowsStore()
    store.open({ type: 'x', key: 'a', title: 'Alpha' })
    store.open({ type: 'x', key: 'b', title: 'Beta' })
    store.open({ type: 'x', key: 'c', title: 'Gamma' })
    // strip: every window is mounted side by side
    expect(mountMode('strip').findAll('.winbody')).toHaveLength(3)
    // tabs: only the focused window's content is mounted (the L1 perf property)
    expect(mountMode('tabs').findAll('.winbody')).toHaveLength(1)
  })

  it('focuses a window when its tab is clicked', async () => {
    const store = useWindowsStore()
    store.open({ type: 'x', key: 'a', title: 'Alpha' })
    store.open({ type: 'x', key: 'b', title: 'Beta' }) // focused = Beta
    const w = mountMode('tabs')
    await w.findAll('.plancia__tab-name')[0]!.trigger('click')
    expect(store.focusedId).toBe(store.windows[0]!.id)
  })

  it('closes a window directly from its tab close button', async () => {
    const store = useWindowsStore()
    store.open({ type: 'x', key: 'a', title: 'Alpha' })
    store.open({ type: 'x', key: 'b', title: 'Beta' })
    const w = mountMode('tabs')
    expect(store.windows).toHaveLength(2)
    await w.findAll('.plancia__tab-close')[0]!.trigger('click')
    expect(store.windows).toHaveLength(1)
    expect(store.windows[0]!.key).toBe('b')
  })

  it('the built-in toggle switches the view mode (update:viewMode)', async () => {
    const store = useWindowsStore()
    store.open({ type: 'x', key: 'a', title: 'Alpha' })
    const w = mountMode('tabs')
    await w.find('.plancia__view-toggle').trigger('click')
    expect(w.emitted('update:viewMode')).toBeTruthy()
    expect(w.emitted('update:viewMode')![0]).toEqual(['strip'])
  })

  it('never leaves the tabs pane blank: auto-focuses the first visible window', async () => {
    const store = useWindowsStore()
    // Open without focus, then clear focus → tabs mode must still pick one.
    store.open({ type: 'x', key: 'a', title: 'Alpha', focus: false })
    store.focusedId = null
    const w = mountMode('tabs')
    await w.vm.$nextTick()
    expect(store.focusedId).toBe(store.windows[0]!.id)
    expect(w.findAll('.winbody')).toHaveLength(1)
  })
})

// IMP-006: a window's content that opens another window (which takes the
// focus) and then asks to close must close its own window, not the new one.
describe('Plancia window events go to the window that sent them', () => {
  const Opener = markRaw(
    defineComponent({
      emits: ['close', 'title'],
      setup(_, { emit }) {
        const open = useOpenWindow()
        return () =>
          h(
            'button',
            {
              class: 'open-then-close',
              onClick: () => {
                open({ type: 'x', key: 'next', title: 'Next' })
                emit('title', 'Renamed')
                emit('close')
              },
            },
            'go',
          )
      },
    }),
  )

  it.each(['tabs', 'strip'] as const)('in %s mode', async (viewMode) => {
    const store = useWindowsStore()
    store.open({ type: 'opener', key: 'form', title: 'Form' })
    const w = mount(Plancia, {
      props: { registry: { ...registry, opener: Opener }, viewMode },
      global: { plugins: [pinia] },
    })
    await w.get('.open-then-close').trigger('click')
    expect(store.windows.map((x) => x.key)).toEqual(['next'])
    expect(store.windows[0]!.title).toBe('Next')
    expect(store.focused?.key).toBe('next')
  })
})

// F-03: the focus follows the windows. A window that closes or shrinks to
// the footer while it holds the focus gives it back to the control that
// opened it, else to the window that takes over, else to the host
// (focus-out); Alt+arrows carry the focus, not only the highlight.
describe('Plancia focus follows the windows (F-03)', () => {
  enableAutoUnmount(afterEach)
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  /** A content whose own button asks to close its window. */
  const Closer = markRaw(
    defineComponent({
      emits: ['close'],
      setup(_, { emit }) {
        return () => h('button', { class: 'own-close', onClick: () => emit('close') }, 'done')
      },
    }),
  )

  function setup() {
    vi.useFakeTimers()
    const opener = document.createElement('button')
    opener.textContent = 'opener'
    const other = document.createElement('button')
    other.textContent = 'other'
    document.body.append(opener, other)
    const w = mount(Plancia, {
      props: { registry: { ...registry, closer: Closer } },
      global: { plugins: [pinia] },
      attachTo: document.body,
    })
    const store = useWindowsStore()
    const win = (id: string) => document.querySelector<HTMLElement>(`[data-win-id="${id}"]`)!
    const button = (id: string, label: string) =>
      win(id).querySelector<HTMLElement>(`header button[aria-label="${label}"]`)!
    /** Opens a window from the opener, which has the focus. */
    const openFrom = (key: string, type = 'x') => {
      opener.focus()
      return store.open({ type, key, title: key })
    }
    /** Focuses `el` and clicks it, as a keyboard user would; then lets the
     *  render and the focus move run. */
    const press = async (el: HTMLElement) => {
      el.focus()
      el.click()
      await vi.advanceTimersByTimeAsync(0)
    }
    const settle = () => vi.advanceTimersByTimeAsync(0)
    return { w, store, opener, other, win, button, openFrom, press, settle }
  }

  it('closing a window gives the focus back to the control that opened it', async () => {
    const { opener, button, openFrom, press, settle } = setup()
    const id = openFrom('a')
    await settle()
    await press(button(id, 'Close'))
    expect(document.activeElement).toBe(opener)
  })

  it('without its opener, the focus goes to the window that takes over', async () => {
    const { store, opener, win, button, openFrom, press, settle } = setup()
    const a = store.open({ type: 'x', key: 'a', title: 'a' })
    const b = openFrom('b')
    await settle()
    opener.remove()
    await press(button(b, 'Close'))
    expect(store.focusedId).toBe(a)
    expect(document.activeElement).toBe(win(a))
  })

  it('minimizing gives the focus back the same way', async () => {
    const { store, opener, win, button, openFrom, press, settle } = setup()
    const a = store.open({ type: 'x', key: 'a', title: 'a' })
    const b = openFrom('b')
    await settle()
    await press(button(b, 'Minimize'))
    expect(document.activeElement).toBe(opener)
    opener.remove()
    store.restore(b)
    await settle()
    await press(button(b, 'Minimize'))
    expect(document.activeElement).toBe(win(a))
  })

  it('a close asked by the content follows the same rule', async () => {
    const { opener, win, openFrom, press, settle } = setup()
    const id = openFrom('c', 'closer')
    await settle()
    await press(win(id).querySelector<HTMLElement>('.own-close')!)
    expect(document.activeElement).toBe(opener)
  })

  it('the last window gone, the host gets focus-out', async () => {
    const { w, store, button, press, settle } = setup()
    const id = store.open({ type: 'x', key: 'a', title: 'a' })
    await settle()
    await press(button(id, 'Close'))
    expect(w.emitted('focus-out')).toHaveLength(1)
  })

  it('a window closed while the focus is elsewhere leaves the focus alone', async () => {
    const { w, store, other, openFrom, settle } = setup()
    const id = openFrom('a')
    await settle()
    other.focus()
    store.close(id)
    await settle()
    expect(document.activeElement).toBe(other)
    expect(w.emitted('focus-out')).toBeUndefined()
  })

  it('closing from the chip of a minimized window keeps the focus in the plancia', async () => {
    const { store, win, press, settle } = setup()
    const a = store.open({ type: 'x', key: 'a', title: 'a' })
    const b = store.open({ type: 'x', key: 'b', title: 'b' })
    store.minimize(b)
    await settle()
    await press(document.querySelector<HTMLElement>(`[data-chip-id="${b}"] .plancia__chip-close`)!)
    expect(document.activeElement).toBe(win(a))
  })

  it('restoring from its chip puts the focus in the window', async () => {
    const { store, win, press, settle } = setup()
    store.open({ type: 'x', key: 'a', title: 'a' })
    const b = store.open({ type: 'x', key: 'b', title: 'b' })
    store.minimize(b)
    await settle()
    await press(document.querySelector<HTMLElement>(`[data-chip-id="${b}"] .plancia__chip-name`)!)
    expect(document.activeElement).toBe(win(b))
  })

  it('Alt+arrows carry the focus into the next window', async () => {
    const { store, win, button, settle } = setup()
    const a = store.open({ type: 'x', key: 'a', title: 'a' })
    const b = store.open({ type: 'x', key: 'b', title: 'b' })
    await settle()
    button(b, 'Minimize').focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true }))
    await settle()
    expect(store.focusedId).toBe(a)
    expect(document.activeElement).toBe(win(a))
  })

  it('Alt+arrows leave a focus outside the plancia where it is', async () => {
    const { store, other, settle } = setup()
    const a = store.open({ type: 'x', key: 'a', title: 'a' })
    store.open({ type: 'x', key: 'b', title: 'b' })
    await settle()
    other.focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true }))
    await settle()
    expect(store.focusedId).toBe(a)
    expect(document.activeElement).toBe(other)
  })
})
