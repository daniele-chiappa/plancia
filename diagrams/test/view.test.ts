// @vitest-environment jsdom
import { describe, expect, it, beforeAll } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { DiagramView, diagramToSVG, parseDiagram } from '../src'

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

  it('draws a quadrant matrix in its own SVG, a point with a link opening it', async () => {
    const w = mount(DiagramView, {
      props: {
        source: 'kind: matrix\ntitle: E\nx: {label: Urgency, low: No, high: Yes}\ny: Importance\nquadrants: [Plan, Do, Drop, Give]\nitems:\n  - {label: Release, x: 0.8, y: 0.9, link: "[[p/r]]"}\n  - {label: Mail, x: 0.2, y: 0.1}',
      },
      attachTo: document.body,
    })
    await settle()
    const svg = w.find('.plancia-diagram__matrix-svg svg')
    expect(svg.exists()).toBe(true)
    expect(svg.findAll('[data-item]')).toHaveLength(2)
    expect(svg.text()).toContain('Do')
    await w.find('[data-item="0"]').trigger('pointerdown')
    await w.find('.plancia-diagram__matrix-svg').trigger('pointerup')
    expect(w.emitted('link')?.[0]).toEqual([{ target: 'p/r', kind: 'note', label: 'Release' }])
    const out = (w.vm as unknown as { exportSVG: () => string | null }).exportSVG()
    expect(out).toContain('<title>E</title>')
    expect(out).toContain('Release')
    w.unmount()
  })

  it('draws a grid as a table', async () => {
    const w = mount(DiagramView, { props: { source: 'kind: matrix\nrows: [In, Out]\ncolumns: [Good, Bad]\ncells: [[S, W], [O, T]]' } })
    await settle()
    expect(w.find('.plancia-diagram__matrix-svg svg').text().split(/\s+/)).toEqual(['Good', 'Bad', 'In', 'S', 'W', 'Out', 'O', 'T'])
  })

  it('draws a diagram as an SVG file without a view', async () => {
    const flow = await diagramToSVG(parseDiagram('kind: flow\ntitle: F\nnodes: [a, b]\nedges: ["a -> b"]').diagram!)
    expect(flow).toContain('<title>F</title>')
    expect(flow).toContain('<desc>F — Flow (TB), 2 nodes, 1 edge: a → b</desc>')
    const grid = await diagramToSVG(parseDiagram('kind: matrix\nrows: [In]\ncolumns: [Good]\ncells: [[S]]').diagram!)
    expect(grid).toContain('>S</tspan>')
    expect(await diagramToSVG(parseDiagram('kind: gantt\nsections: [{label: S}]').diagram!)).toBeNull()
  })
})
