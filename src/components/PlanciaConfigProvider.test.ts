// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import PlanciaConfigProvider from './PlanciaConfigProvider.vue'
import { usePlanciaConfig } from '../config/usePlanciaConfig'

enableAutoUnmount(afterEach)
afterEach(() => document.documentElement.removeAttribute('style'))

describe('PlanciaConfigProvider', () => {
  it('sets theme vars on its wrapper', () => {
    const w = mount(PlanciaConfigProvider, {
      props: { config: { theme: { '--plancia-accent': 'tomato' } }, global: false },
    })
    expect(w.element.getAttribute('style')).toContain('--plancia-accent: tomato')
  })

  it('mirrors the theme onto :root when global (default) and cleans up on unmount', () => {
    const w = mount(PlanciaConfigProvider, {
      props: { config: { theme: { '--plancia-accent': 'tomato' } } },
    })
    expect(document.documentElement.style.getPropertyValue('--plancia-accent')).toBe('tomato')
    w.unmount()
    expect(document.documentElement.style.getPropertyValue('--plancia-accent')).toBe('')
  })

  it('does not touch :root when global=false', () => {
    mount(PlanciaConfigProvider, {
      props: { config: { theme: { '--plancia-accent': 'tomato' } }, global: false },
    })
    expect(document.documentElement.style.getPropertyValue('--plancia-accent')).toBe('')
  })

  it('provides the reactive config to descendants', () => {
    const Child = defineComponent({
      setup() {
        const cfg = usePlanciaConfig()
        return () => h('span', { class: 'probe' }, cfg?.value.meta?.name ?? 'none')
      },
    })
    const w = mount(PlanciaConfigProvider, {
      props: { config: { meta: { name: 'dark' } } },
      slots: { default: () => h(Child) },
    })
    expect(w.get('.probe').text()).toBe('dark')
  })
})
