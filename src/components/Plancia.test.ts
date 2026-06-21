// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h, markRaw } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import Plancia from './Plancia.vue'
import { useOpenWindow } from '../composables/openWindow'

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
