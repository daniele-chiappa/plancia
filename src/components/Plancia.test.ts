// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, markRaw, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import Plancia from './Plancia.vue'
import { useOpenWindow } from '../composables/openWindow'
import { useWindowsStore } from '../store/windows'

// jsdom doesn't implement scrollIntoView (Plancia scrolls the focused window).
Element.prototype.scrollIntoView = () => {}

enableAutoUnmount(afterEach)

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

  // A window put aside by another tab keeps its own content: before, it read
  // the focused window, so it took the other tab's (and lost its state), and
  // the last window closed threw on a focus of null.
  const Field = markRaw(
    defineComponent({
      props: { name: { type: String, default: '' } },
      setup(props) {
        const mounts = (globalThis as { fieldMounts?: string[] }).fieldMounts ?? []
        mounts.push(props.name)
        ;(globalThis as { fieldMounts?: string[] }).fieldMounts = mounts
        return () => h('input', { class: 'field', 'data-name': props.name })
      },
    }),
  )
  const kept = { ...registry, field: Field }
  const mountKept = (errorHandler = vi.fn()) =>
    mount(Plancia, {
      props: { registry: kept, viewMode: 'tabs' },
      global: { plugins: [pinia], config: { errorHandler } },
      attachTo: document.body,
    })
  afterEach(() => {
    delete (globalThis as { fieldMounts?: string[] }).fieldMounts
  })

  it('keeps the state of a window while another tab is shown', async () => {
    const store = useWindowsStore()
    store.open({ type: 'field', key: 'a', title: 'Alpha', props: { name: 'a' } })
    const w = mountKept()
    await nextTick()
    ;(w.get('.field').element as HTMLInputElement).value = 'typed'
    store.open({ type: 'x', key: 'b', title: 'Beta' })
    await nextTick()
    store.open({ type: 'field', key: 'c', title: 'Gamma', props: { name: 'c' } })
    await nextTick()
    expect(w.get('.field').attributes('data-name')).toBe('c')
    store.focus(store.windows[0]!.id)
    await nextTick()
    const field = w.get('.field')
    expect(field.attributes('data-name')).toBe('a')
    expect((field.element as HTMLInputElement).value).toBe('typed')
    expect((globalThis as { fieldMounts?: string[] }).fieldMounts).toEqual(['a', 'c'])
  })

  it('closes the last window with no error', async () => {
    const errorHandler = vi.fn()
    const store = useWindowsStore()
    store.open({ type: 'field', key: 'a', title: 'Alpha', props: { name: 'a' } })
    store.open({ type: 'x', key: 'b', title: 'Beta' })
    const w = mountKept(errorHandler)
    await nextTick()
    store.close(store.windows[1]!.id)
    await nextTick()
    store.close(store.windows[0]!.id)
    await nextTick()
    expect(store.windows).toHaveLength(0)
    expect(w.find('.plancia__empty').exists()).toBe(true)
    expect(errorHandler).not.toHaveBeenCalled()
  })

  // A frame kept alive leaves the page while another tab shows, and a browser
  // reloads an iframe taken out of the page: keepMounted keeps such a window
  // in the page, hidden.
  const Page = markRaw(defineComponent({ render: () => h('iframe', { class: 'page' }) }))
  const mountKeptMounted = (keepMounted?: (win: { type: string }) => boolean) =>
    mount(Plancia, {
      props: { registry: { ...registry, page: Page }, viewMode: 'tabs', keepMounted },
      global: { plugins: [pinia] },
      attachTo: document.body,
    })

  it('keeps a window kept mounted in the page, hidden, while another tab shows', async () => {
    const store = useWindowsStore()
    store.open({ type: 'page', key: 'p', title: 'Page' })
    const w = mountKeptMounted((win) => win.type === 'page')
    await nextTick()
    const frame = w.get('.page').element
    store.open({ type: 'x', key: 'b', title: 'Beta' })
    await nextTick()
    expect(frame.isConnected).toBe(true)
    expect((frame.closest('.plancia-window') as HTMLElement).style.display).toBe('none')
    expect(w.findAll('.winbody')).toHaveLength(1)
    store.focus(store.windows[0]!.id)
    await nextTick()
    expect(w.get('.page').element).toBe(frame)
    expect((frame.closest('.plancia-window') as HTMLElement).style.display).toBe('')
    expect(w.findAll('.plancia-window').filter((f) => f.isVisible())).toHaveLength(1)
    store.close(store.windows[0]!.id)
    await nextTick()
    expect(frame.isConnected).toBe(false)
  })

  it('without keepMounted, a window leaves the page while another tab shows', async () => {
    const store = useWindowsStore()
    store.open({ type: 'page', key: 'p', title: 'Page' })
    const w = mountKeptMounted()
    await nextTick()
    const frame = w.get('.page').element
    store.open({ type: 'x', key: 'b', title: 'Beta' })
    await nextTick()
    expect(frame.isConnected).toBe(false)
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

// F-33, F-18: the tabs mode follows the ARIA tabs pattern. Only tabs in the
// tab list, one of them in the Tab sequence; arrows, Home and End move and
// activate; Delete closes; the pane is the tab panel of the active tab.
describe('Plancia tabs follow the ARIA tabs pattern (F-33, F-18)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  function setup(keys = ['a', 'b', 'c']) {
    const store = useWindowsStore()
    const ids = keys.map((k) => store.open({ type: 'x', key: k, title: k.toUpperCase() }))
    const w = mount(Plancia, {
      props: { registry, viewMode: 'tabs' },
      global: { plugins: [pinia] },
      attachTo: document.body,
    })
    const tab = (id: string) => document.querySelector<HTMLElement>(`[data-tab-id="${id}"] [role="tab"]`)!
    const key = async (el: HTMLElement, k: string, init: KeyboardEventInit = {}) => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }))
      await nextTick()
    }
    return { w, store, ids, tab, key }
  }

  it('the tab list holds only tabs: the close buttons are for the mouse', () => {
    setup()
    const list = document.querySelector('[role="tablist"]')!
    const closes = list.querySelectorAll('.plancia__tab-close')
    expect(closes).toHaveLength(3)
    for (const c of closes) {
      expect(c.getAttribute('tabindex')).toBe('-1')
      expect(c.getAttribute('aria-hidden')).toBe('true')
    }
    const exposed = list.querySelectorAll('button:not([aria-hidden="true"])')
    expect([...exposed].every((b) => b.getAttribute('role') === 'tab')).toBe(true)
  })

  it('one tab in the Tab sequence, the active one, controlling the panel', () => {
    const { ids, tab } = setup()
    expect(ids.map((id) => tab(id).getAttribute('tabindex'))).toEqual(['-1', '-1', '0'])
    const panel = document.querySelector('[role="tabpanel"]')!
    expect(panel).not.toBeNull()
    expect(panel.getAttribute('aria-labelledby')).toBe(tab(ids[2]!).id)
    expect(ids.every((id) => tab(id).getAttribute('aria-controls') === panel.id)).toBe(true)
    expect(panel.querySelector('.winbody')).not.toBeNull()
  })

  it('arrows, Home and End move between the tabs and activate them', async () => {
    const { store, ids, tab, key } = setup()
    const [a, b, c] = ids as [string, string, string]
    tab(c).focus()
    await key(tab(c), 'ArrowRight') // wraps
    expect(store.focusedId).toBe(a)
    expect(document.activeElement).toBe(tab(a))
    await key(tab(a), 'ArrowLeft') // wraps back
    expect(document.activeElement).toBe(tab(c))
    await key(tab(c), 'Home')
    expect(document.activeElement).toBe(tab(a))
    await key(tab(a), 'End')
    expect(document.activeElement).toBe(tab(c))
    await key(tab(c), 'ArrowLeft')
    expect(store.focusedId).toBe(b)
    expect(document.activeElement).toBe(tab(b))
    expect(tab(b).getAttribute('tabindex')).toBe('0')
  })

  it('Delete closes the tab and focuses the tab that takes over', async () => {
    const { store, ids, tab, key } = setup(['a', 'b'])
    const [a, b] = ids as [string, string]
    expect(tab(b).getAttribute('aria-keyshortcuts')).toBe('Delete')
    tab(b).focus()
    await key(tab(b), 'Delete')
    await nextTick()
    expect(store.windows.map((x) => x.id)).toEqual([a])
    expect(document.activeElement).toBe(tab(a))
  })

  it('Delete asks first when the window has unsaved changes', async () => {
    const { store, ids, tab, key } = setup(['a', 'b'])
    const b = ids[1]!
    store.setDirty(b, true)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    tab(b).focus()
    await key(tab(b), 'Delete')
    expect(confirm).toHaveBeenCalledOnce()
    expect(store.windows).toHaveLength(2)
    expect(document.activeElement).toBe(tab(b))
  })

  it('Alt+arrows on a tab are the window keys: one step, into the window', async () => {
    vi.useFakeTimers()
    const { store, ids, tab } = setup()
    const b = ids[1]!
    tab(ids[2]!).focus()
    tab(ids[2]!).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true }))
    await vi.advanceTimersByTimeAsync(0)
    expect(store.focusedId).toBe(b)
    expect(document.activeElement).toBe(document.querySelector(`[data-win-id="${b}"]`))
    vi.useRealTimers()
  })
})
