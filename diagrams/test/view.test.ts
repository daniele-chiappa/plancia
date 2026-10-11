// @vitest-environment jsdom
import { describe, expect, it, beforeAll } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { DiagramView } from '../src'

beforeAll(() => {
  // jsdom has no ResizeObserver; Vue Flow and the view need one.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

const settle = async () => {
  await flushPromises()
  await nextTick()
  await flushPromises()
}

describe('DiagramView', () => {
  it('draws a flow, and its text is there for screen readers', async () => {
    const w = mount(DiagramView, {
      props: { source: 'kind: flow\ntitle: T\nnodes: [{id: a, label: Start}, {id: b, label: End, link: "[[p/n#H|x]]"}]\nedges: ["a -> b: go"]' },
      attachTo: document.body,
    })
    await settle()
    expect(w.find('figcaption').text()).toBe('T')
    expect(w.find('.plancia-diagram__alt').text()).toBe('T — Flow (TB), 2 nodes, 1 edge: Start → End (go)')
    expect(w.findAll('.pd-node')).toHaveLength(2)
    await w.find('.pd-node__open').trigger('click')
    expect(w.emitted('link')?.[0]).toEqual([{ target: 'p/n#H', kind: 'note', label: 'End' }])
    const svg = (w.vm as unknown as { exportSVG: () => string | null }).exportSVG()
    expect(svg).toContain('<title>T</title>')
    w.unmount()
  })

  it('lists the problems with their lines', async () => {
    const w = mount(DiagramView, { props: { source: 'kind: flow\nnodes: [a]\nedges: ["a -> z"]' } })
    await settle()
    expect(w.findAll('.plancia-diagram__problems li').map((li) => li.text())).toEqual([
      'line 3: the edge a -> z names "z", which is no node or group',
    ])
  })

  it('shows a diagram that does not read as its problem only', async () => {
    const w = mount(DiagramView, { props: { source: 'kind: nope' } })
    await settle()
    expect(w.find('.plancia-diagram__problems').text()).toContain('kind "nope" is not one of')
    expect(w.find('.plancia-diagram__flow').exists()).toBe(false)
  })

  it('says the kinds it does not draw yet', async () => {
    const w = mount(DiagramView, {
      props: { source: 'kind: venn\nsets: [A, B]', labels: { pending: 'Non ancora disegnato:' } },
    })
    await settle()
    expect(w.find('.plancia-diagram__pending').text()).toContain('Non ancora disegnato:')
    expect(w.find('.plancia-diagram__pending').text()).toContain('Venn of 2 sets: A, B')
  })
})
