// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h, markRaw } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
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
