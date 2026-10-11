import { describe, expect, it } from 'vitest'
import { parseDiagram, flowGraph, treeGraph, layoutGraph, edgePath, flowToSVG, toMermaid, mermaidText, linkTarget, DEFAULT_PALETTE } from '../src'
import type { Measure } from '../src'

const measure: Measure = (t) => t.length * 7
const read = (src: string) => {
  const { diagram, problems } = parseDiagram(src)
  expect(problems).toEqual([])
  return diagram!
}
const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe('layoutGraph', () => {
  it('lays a flow out without overlaps, in its direction', () => {
    const d = read('kind: flow\ndirection: LR\nnodes: [a, b, c]\nedges: ["a -> b", "b -> c: next"]')
    const laid = layoutGraph(flowGraph(d), measure)
    const [a, b, c] = laid.nodes
    expect(a!.x).toBeLessThan(b!.x)
    expect(b!.x).toBeLessThan(c!.x)
    expect(overlap(a!, b!) || overlap(b!, c!) || overlap(a!, c!)).toBe(false)
    expect(laid.edges).toHaveLength(2)
    expect(laid.edges[1]!.labelAt).not.toBeNull()
    for (const n of laid.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0)
      expect(n.x + n.w).toBeLessThanOrEqual(laid.width)
      expect(n.y + n.h).toBeLessThanOrEqual(laid.height)
    }
  })

  it('puts the ids of layout: where it says', () => {
    const d = read('kind: flow\nnodes: [a, b]\nedges: ["a -> b"]\nlayout:\n  a: {x: 500, y: 40}\n  b: {x: 100, y: 300, w: 200, h: 60}')
    const laid = layoutGraph(flowGraph(d), measure, d.layout)
    const [a, b] = laid.nodes
    // The drawing starts at the margin; the distances stay those of layout:.
    expect(a!.x - b!.x).toBe(400)
    expect(b!.y - a!.y).toBe(260)
    expect([b!.w, b!.h]).toEqual([200, 60])
    expect(laid.edges[0]!.points).toHaveLength(4)
  })

  it('draws a group around its nodes, and an edge to a group', () => {
    const d = read('kind: flow\nnodes: [a, b, c]\ngroups:\n  - {id: g, label: G, nodes: [b, c]}\nedges: ["a -> g", "b -> c"]')
    const laid = layoutGraph(flowGraph(d), measure)
    const g = laid.groups[0]!
    for (const id of ['b', 'c']) {
      const n = laid.nodes.find((x) => x.id === id)!
      expect(n.x).toBeGreaterThan(g.x)
      expect(n.y).toBeGreaterThan(g.y)
      expect(n.x + n.w).toBeLessThan(g.x + g.w)
      expect(n.y + n.h).toBeLessThan(g.y + g.h)
    }
    expect(laid.edges.map((e) => e.to)).toEqual(['g', 'c'])
  })

  it('keeps the branches of a tree in their order', () => {
    const d = read('kind: tree\nroot: R\nchildren: [Zeta, Alpha, Mid]')
    const laid = layoutGraph(treeGraph(d), measure)
    const xs = ['Zeta', 'Alpha', 'Mid'].map((l) => laid.nodes.find((n) => n.label === l)!.x)
    expect([...xs].sort((p, q) => p - q)).toEqual(xs)
  })

  it('leaves out what the reader found wrong', () => {
    const { diagram } = parseDiagram('kind: flow\nnodes: [a, a, b]\nedges: ["a -> b", "a -> nowhere"]')
    const g = flowGraph(diagram!)
    expect(g.nodes.map((n) => n.id)).toEqual(['a', 'b'])
    expect(g.edges).toHaveLength(1)
  })
})

describe('edgePath', () => {
  it('is straight on two points and a curve through more, from the first to the last', () => {
    expect(edgePath([{ x: 0, y: 0 }, { x: 10, y: 20 }])).toBe('M0 0L10 20')
    const d = edgePath([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 20 }])
    expect(d.startsWith('M0 0')).toBe(true)
    expect(d.endsWith('L0 20')).toBe(true)
    expect(d).toContain('C')
  })
})

describe('flowToSVG', () => {
  it('is an SVG of its own, its text escaped', () => {
    const d = read('kind: flow\ntitle: "A <b> & c"\nnodes: [{id: a, label: "x < y", link: "[[p/n]]"}, {id: b, shape: decision}]\nedges: ["a -> b: \\"q\\""]')
    const svg = flowToSVG(layoutGraph(flowGraph(d), measure), DEFAULT_PALETTE, { title: d.title })
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg).toContain('<title>A &lt;b&gt; &amp; c</title>')
    expect(svg).toContain('x &lt; y')
    expect(svg).toContain('&quot;q&quot;')
    expect(svg).toContain('marker-end="url(#arrow)"')
    expect(svg).not.toMatch(/var\(|<script/)
  })
})

describe('toMermaid', () => {
  it('writes a mind map with its labels quoted', () => {
    const d = read('kind: mindmap\nroot: "A (b)"\nchildren:\n  - "say \\"hi\\"": [x]\n  - "costs $5 # now"')
    expect(toMermaid(d)).toBe(
      'mindmap\n  n0(("A (b)"))\n    n1["say #quot;hi#quot;"]\n      n2["x"]\n    n3["costs #36;5 #35; now"]\n',
    )
  })

  it('writes a fishbone, the effect first and a line per cause', () => {
    const d = read('kind: fishbone\nroot: Late\nchildren:\n  - Methods: [No checklist]\n  - "%% Machines": [Old]')
    expect(toMermaid(d)).toBe('ishikawa\n    Late\n        Methods\n            No checklist\n        % % Machines\n            Old\n')
  })

  it('writes a Venn: its sets, its areas with their sizes, the part of one set as its text', () => {
    const d = read('kind: venn\ntitle: T\nsets: [A, {id: text, label: "B #1"}]\nareas:\n  - {sets: [A, text], label: Both, size: 2}\n  - {sets: [A], label: Only A}')
    expect(toMermaid(d)).toBe('venn-beta\n  title T\n  set A["A"]\n  set s1["B #35;1"]\n  union A,s1["Both"]: 2\n  text A "Only A"\n')
  })

  it('has nothing for a diagram with nothing to draw', () => {
    expect(toMermaid(read('kind: gantt\nsections: [{label: S}]'))).toBe('')
  })

  it('keeps one line', () => {
    expect(mermaidText('a\n  b')).toBe('a b')
  })
})

describe('linkTarget', () => {
  it.each([
    ['[[team/one]]', { target: 'team/one', kind: 'note' }],
    ['[[team/two#Plan|the plan]]', { target: 'team/two#Plan', kind: 'note' }],
    ['https://example.com/a', { target: 'https://example.com/a', kind: 'url' }],
  ])('%s', (link, want) => {
    expect(linkTarget(link, 'L')).toEqual({ ...want, label: 'L' })
  })
  it('is null for what is no link', () => {
    expect(linkTarget('javascript:alert(1)')).toBeNull()
    expect(linkTarget('[[]]')).toBeNull()
  })
})
