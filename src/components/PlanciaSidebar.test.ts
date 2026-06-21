// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import PlanciaSidebar from './PlanciaSidebar.vue'
import { usePlanciaSidebar } from '../sidebar/usePlanciaSidebar'

afterEach(() => {
  // teleported backdrops land on document.body — clear between tests.
  document.body.innerHTML = ''
  // @ts-expect-error allow removing the stub between tests
  delete window.matchMedia
})

const aside = (w: ReturnType<typeof mount>) => w.find('aside.plancia-sidebar')

describe('PlanciaSidebar', () => {
  it('renders the landmark, aria-label and derived data attributes', () => {
    const w = mount(PlanciaSidebar, { props: { position: 'left' } })
    const a = aside(w)
    expect(a.attributes('role')).toBe('complementary')
    expect(a.attributes('aria-label')).toBe('Sidebar')
    expect(a.attributes('data-position')).toBe('left')
    expect(a.attributes('data-orientation')).toBe('vertical')
    expect(a.attributes('data-mode')).toBe('inline')
    expect(a.attributes('data-state')).toBe('expanded')
  })

  it('derives horizontal orientation for top/bottom', () => {
    const w = mount(PlanciaSidebar, { props: { position: 'top' } })
    expect(aside(w).attributes('data-orientation')).toBe('horizontal')
  })

  it('omits the role when landmark="none"', () => {
    const w = mount(PlanciaSidebar, { props: { landmark: 'none' } })
    expect(aside(w).attributes('role')).toBeUndefined()
  })

  it('toggle collapses, updating state + aria-expanded and emitting events', async () => {
    const w = mount(PlanciaSidebar)
    const toggle = w.get('.plancia-sidebar__toggle')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    await toggle.trigger('click')
    expect(w.emitted('update:state')?.at(-1)).toEqual(['collapsed'])
    expect(w.emitted('collapse')).toHaveLength(1)
    expect(aside(w).attributes('data-state')).toBe('collapsed')
    expect(toggle.attributes('aria-expanded')).toBe('false')
  })

  it('is controlled by v-model:state (does not self-mutate)', async () => {
    const w = mount(PlanciaSidebar, { props: { state: 'expanded' } })
    await w.get('.plancia-sidebar__toggle').trigger('click')
    // requested via the model, but the prop still controls the rendered state
    expect(w.emitted('update:state')?.at(-1)).toEqual(['collapsed'])
    expect(aside(w).attributes('data-state')).toBe('expanded')
    await w.setProps({ state: 'collapsed' })
    expect(aside(w).attributes('data-state')).toBe('collapsed')
  })

  it('shows a reveal tab when closed and reopens to the last non-closed state', async () => {
    const w = mount(PlanciaSidebar, { props: { defaultState: 'closed' } })
    const reveal = w.find('.plancia-sidebar__reveal')
    expect(reveal.exists()).toBe(true)
    await reveal.trigger('click')
    expect(w.emitted('open')).toHaveLength(1)
    expect(w.emitted('update:state')?.at(-1)).toEqual(['expanded'])
  })

  it('passes the state signal to scoped slots', () => {
    const w = mount(PlanciaSidebar, {
      props: { defaultState: 'collapsed' },
      slots: { default: (sp: { state: string; contentVisible: boolean }) => h('span', { class: 'probe' }, `${sp.state}:${sp.contentVisible}`) },
    })
    expect(w.get('.probe').text()).toBe('collapsed:false')
  })

  it('renders the #collapsed slot while collapsed, the default slot when expanded', async () => {
    const w = mount(PlanciaSidebar, {
      props: { defaultState: 'collapsed' },
      slots: {
        default: () => h('span', { class: 'full' }, 'F'),
        collapsed: () => h('span', { class: 'rail' }, 'R'),
      },
    })
    expect(w.find('.rail').exists()).toBe(true)
    expect(w.find('.full').exists()).toBe(false)
    await w.setProps({ state: 'expanded' })
    expect(w.find('.full').exists()).toBe(true)
    expect(w.find('.rail').exists()).toBe(false)
  })

  it('merges injectable labels onto the toggle', () => {
    const w = mount(PlanciaSidebar, { props: { labels: { collapse: 'Comprimi' } } })
    expect(w.get('.plancia-sidebar__toggle').attributes('aria-label')).toBe('Comprimi')
  })

  it('shows a resize handle (only when resizable + expanded) and resizes via keyboard', async () => {
    const collapsed = mount(PlanciaSidebar, { props: { resizable: true, defaultState: 'collapsed' } })
    expect(collapsed.find('.plancia-sidebar__resize').exists()).toBe(false)

    const w = mount(PlanciaSidebar, { props: { resizable: true, defaultSize: 200, position: 'left' } })
    const handle = w.get('.plancia-sidebar__resize')
    expect(handle.attributes('role')).toBe('separator')
    expect(handle.attributes('aria-orientation')).toBe('vertical')
    await handle.trigger('keydown', { key: 'ArrowRight' })
    expect(w.emitted('update:size')?.at(-1)).toEqual([216])
    expect(w.emitted('resize')?.at(-1)).toEqual([216])
  })

  it('hover-peek expands transiently in overlay+collapsed (with hover-intent)', async () => {
    vi.useFakeTimers()
    const w = mount(PlanciaSidebar, { props: { mode: 'overlay', defaultState: 'collapsed' } })
    await aside(w).trigger('pointerenter')
    expect(aside(w).attributes('data-peeking')).toBeUndefined() // not yet — intent delay
    vi.advanceTimersByTime(150)
    await nextTick()
    expect(aside(w).attributes('data-peeking')).toBe('')
    expect(w.emitted('peek-start')).toHaveLength(1)
    await aside(w).trigger('pointerleave')
    vi.advanceTimersByTime(300)
    await nextTick()
    expect(aside(w).attributes('data-peeking')).toBeUndefined()
    expect(w.emitted('peek-end')).toHaveLength(1)
    vi.useRealTimers()
  })

  it('does not peek in inline mode', async () => {
    vi.useFakeTimers()
    const w = mount(PlanciaSidebar, { props: { mode: 'inline', defaultState: 'collapsed' } })
    await aside(w).trigger('pointerenter')
    vi.advanceTimersByTime(300)
    await nextTick()
    expect(aside(w).attributes('data-peeking')).toBeUndefined()
    expect(w.emitted('peek-start')).toBeUndefined()
    vi.useRealTimers()
  })

  it('Esc steps an overlay sidebar down (expanded → collapsed)', async () => {
    const w = mount(PlanciaSidebar, { props: { mode: 'overlay', defaultState: 'expanded' } })
    await aside(w).trigger('keydown', { key: 'Escape' })
    expect(aside(w).attributes('data-state')).toBe('collapsed')
  })

  it('becomes an overlay drawer below the responsive breakpoint', async () => {
    const mql = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }
    window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia
    const w = mount(PlanciaSidebar, { props: { mode: 'inline', responsive: 768 } })
    await nextTick()
    expect(aside(w).attributes('data-mode')).toBe('overlay')
    expect(aside(w).attributes('data-drawer')).toBe('')
  })

  it('renders a backdrop (teleported) that collapses on click', async () => {
    const w = mount(PlanciaSidebar, { props: { mode: 'overlay', backdrop: true, defaultState: 'expanded' } })
    await nextTick()
    const backdrop = document.body.querySelector('.plancia-sidebar__backdrop') as HTMLElement | null
    expect(backdrop).not.toBeNull()
    backdrop!.click()
    await nextTick()
    expect(w.emitted('collapse')).toHaveLength(1)
    expect(aside(w).attributes('data-state')).toBe('collapsed')
    w.unmount()
  })

  it('lets slot content drive the sidebar via usePlanciaSidebar()', async () => {
    const Child = defineComponent({
      setup() {
        const sb = usePlanciaSidebar()
        return () => h('button', { class: 'child-toggle', onClick: () => sb?.toggle() }, 'x')
      },
    })
    const w = mount(PlanciaSidebar, { slots: { default: () => h(Child) } })
    await w.get('.child-toggle').trigger('click')
    expect(w.emitted('update:state')?.at(-1)).toEqual(['collapsed'])
    expect(aside(w).attributes('data-state')).toBe('collapsed')
  })
})
