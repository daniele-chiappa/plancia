// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import { mount } from '@vue/test-utils'
import PlanciaLayout from './PlanciaLayout.vue'

describe('PlanciaLayout', () => {
  it('renders the default slot as the centre (.plancia-layout__main)', () => {
    const w = mount(PlanciaLayout, { slots: { default: () => h('div', { class: 'content' }, 'C') } })
    expect(w.find('.plancia-layout__mid > .plancia-layout__main > .content').exists()).toBe(true)
  })

  it('flanks the centre with left/right in the middle band, in order', () => {
    const w = mount(PlanciaLayout, {
      slots: {
        left: () => h('div', { class: 'l' }),
        right: () => h('div', { class: 'r' }),
        default: () => h('div', { class: 'c' }),
      },
    })
    const kids = Array.from(w.get('.plancia-layout__mid').element.children).map((c) => c.className)
    expect(kids[0]).toContain('l')
    expect(kids[kids.length - 1]).toContain('r')
    expect(kids).toContain('plancia-layout__main')
  })

  it('renders top/bottom as full-width children of the shell', () => {
    const w = mount(PlanciaLayout, {
      slots: { top: () => h('div', { class: 't' }), bottom: () => h('div', { class: 'b' }) },
    })
    expect(w.find('.plancia-layout > .t').exists()).toBe(true)
    expect(w.find('.plancia-layout > .b').exists()).toBe(true)
  })

  it('works with only the centre (no edge slots)', () => {
    const w = mount(PlanciaLayout, { slots: { default: () => h('div', { class: 'only' }) } })
    expect(w.find('.plancia-layout__main > .only').exists()).toBe(true)
    expect(w.get('.plancia-layout__mid').element.children).toHaveLength(1)
  })
})
