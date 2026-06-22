// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { h } from 'vue'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import PlanciaConfigProvider from './PlanciaConfigProvider.vue'
import PlanciaSidebar from './PlanciaSidebar.vue'
import type { PlanciaConfig } from '../config/types'

enableAutoUnmount(afterEach)
afterEach(() => document.documentElement.removeAttribute('style'))

function mountInProvider(config: PlanciaConfig, sidebarProps: Record<string, unknown> = {}) {
  return mount(PlanciaConfigProvider, {
    props: { config, global: false },
    slots: { default: () => h(PlanciaSidebar, sidebarProps) },
  })
}
const aside = (w: ReturnType<typeof mountInProvider>) => w.find('aside.plancia-sidebar')

describe('config precedence (prop › config › builtin)', () => {
  it('uses the config default when the prop is unset', () => {
    const w = mountInProvider({ components: { sidebar: { defaults: { defaultState: 'collapsed' } } } })
    expect(aside(w).attributes('data-state')).toBe('collapsed')
  })

  it('the explicit prop wins over config', () => {
    const w = mountInProvider(
      { components: { sidebar: { defaults: { defaultState: 'collapsed' } } } },
      { defaultState: 'expanded' },
    )
    expect(aside(w).attributes('data-state')).toBe('expanded')
  })

  it('falls back to the built-in when neither prop nor config set it', () => {
    const w = mountInProvider({})
    expect(aside(w).attributes('data-state')).toBe('expanded')
  })

  it('uses the config mode when the prop is unset', () => {
    const w = mountInProvider({ components: { sidebar: { defaults: { mode: 'floating' } } } })
    expect(aside(w).attributes('data-mode')).toBe('floating')
  })

  it('merges labels from config (driving the toggle label)', () => {
    const w = mountInProvider({ components: { sidebar: { labels: { collapse: 'CfgCollapse' } } } })
    expect(w.get('.plancia-sidebar__toggle').attributes('aria-label')).toBe('CfgCollapse')
  })
})
