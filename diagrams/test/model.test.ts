import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import Ajv from 'ajv'
import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'
import { parseDiagram, diagramText, diagramLinks, diagramSchema, MAX_BYTES, MAX_ITEMS } from '../src'
import { readEdge } from '../src/model/parse'

// The tests of gosidian's internal/diagram/diagram_test.go, ported.
describe('parseDiagram', () => {
  it('makes the short forms full', () => {
    const { diagram: d, problems } = parseDiagram(`kind: flow
nodes: [a, {id: b, label: B}, c-1]
edges:
  - "a -> b"
  - "b->c-1: go: now"
  - {from: c-1, to: a, style: dotted}`)
    expect(problems).toEqual([])
    expect(d!.direction).toBe('TB')
    expect(d!.nodes[0]).toMatchObject({ id: 'a', label: 'a', shape: 'box' })
    expect(d!.edges.map(({ line: _line, ...e }) => e)).toEqual([
      { from: 'a', to: 'b', label: '', style: 'solid' },
      { from: 'b', to: 'c-1', label: 'go: now', style: 'solid' },
      { from: 'c-1', to: 'a', label: '', style: 'dotted' },
    ])

    const m = parseDiagram(`kind: mindmap
root: {label: Centre, id: c}
children:
  - Leaf
  - Branch: [x, {y: [z]}]
  - {label: Full, children: [w]}`)
    expect(m.problems).toEqual([])
    expect(diagramText(m.diagram)).toBe('Mind map of "Centre": Leaf; Branch (x, y (z)); Full (w)')
  })

  it('puts the problems on their lines', () => {
    const { problems } = parseDiagram('kind: flow\nnodes:\n  - a\n  - {id: a}\nedges:\n  - "a -> zz"\n')
    const lines = problems.map((p) => p.line)
    expect(lines).toContain(4)
    expect(lines).toContain(6)
  })

  it('caps the size and the elements', () => {
    const big = parseDiagram('x'.repeat(MAX_BYTES + 1))
    expect(big.problems).toHaveLength(1)
    expect(big.problems[0]!.message).toContain('bytes')
    // The size is in bytes of UTF-8, as on the server.
    expect(parseDiagram('è'.repeat(MAX_BYTES / 2 + 1)).problems[0]!.message).toContain('bytes')

    let src = 'kind: flow\nnodes:\n'
    for (let i = 0; i <= MAX_ITEMS; i++) src += `  - n${'a'.repeat(i % 30)}\n`
    const many = parseDiagram(src)
    expect(many.problems[0]?.message).toContain('more than')
  })

  it('keeps a number as typed and reads dates as text', () => {
    const { diagram, problems } = parseDiagram(
      'kind: gantt\ntasks:\n  - {id: a, label: 1.10, start: 2026-02-28, days: 1}\n  - {label: B, start: 2026-02-30, days: 1}\n',
    )
    expect(diagram!.sections[0]!.tasks[0]!.label).toBe('1.10')
    expect(problems.map((p) => p.message)).toEqual(['start "2026-02-30" is a date, YYYY-MM-DD'])
  })

  it('reads the short form of an edge as gosidian does, fast on a run of blanks', () => {
    // gosidian's pattern (internal/diagram/parse.go), which backtracks here on long blanks.
    const goRe = /^\s*([^\s:>-][^\s>]*?)\s*->\s*([^\s:]+)\s*(?::\s*(.*))?$/
    const go = (s: string) => {
      const m = goRe.exec(s)
      return m ? [m[1], m[2], (m[3] ?? '').trim()] : null
    }
    for (const s of ['a -> b', ' a->b ', 'a -> b: go', 'a -> b:  go now \t', 'a -> b:', 'b->c-1: go: now', 'a -> b:\n  go', 'a -> b:\r\n go',
      'a -> b: go\nmore', 'a -> b \n', 'a -> b: \n\t', 'a -> b:\t\tx\n', 'a -> b:\tgo\r', 'a -> b: go\u2028', 'a-b -> c', 'a -> b c', '-a -> b', 'a -> :b', 'a -> b\u00a0: go']) {
      expect(readEdge(s), JSON.stringify(s)).toEqual(go(s))
    }
    expect(readEdge(`!->!:${'\t'.repeat(100_000)}x\n`)).toBeNull()
    expect(readEdge(`!->!:${'\t'.repeat(100_000)}\n`)).toEqual(['!', '!', ''])
    expect(readEdge(`a -> b:${' '.repeat(100_000)}go`)).toEqual(['a', 'b', 'go'])
  })

  it('lists the links', () => {
    const { diagram } = parseDiagram(
      'kind: tree\nroot: {label: R, link: "[[a/b]]"}\nchildren:\n  - {label: C, link: "https://example.com"}\n',
    )
    expect(diagramLinks(diagram)).toEqual(['[[a/b]]', 'https://example.com'])
  })
})

describe('diagramText', () => {
  it.each([
    ['kind: venn\nsets: [A, B]\nareas:\n  - {sets: [A, B], label: both}', 'Venn of 2 sets: A, B; A ∩ B: both'],
    [
      'kind: matrix\nrows: [r1, r2]\ncolumns: [c1]\ncells:\n  - [x]\n  - []',
      'Matrix of 2 rows by 1 column (r1, r2 × c1); r1 — c1: x',
    ],
    [
      'kind: gantt\ntasks:\n  - {id: a, label: A, start: 2026-10-10, days: 2}\n  - {label: B, after: a, status: milestone}',
      'Gantt, 2 tasks; A from 2026-10-10 for 2 days; B after A [milestone]',
    ],
    ['kind: fishbone\ntitle: T\nroot: Late\nchildren:\n  - Methods: [m1]', 'T — Fishbone of the effect "Late": Methods (m1)'],
  ])('%s', (src, want) => {
    const { diagram, problems } = parseDiagram(src)
    expect(problems).toEqual([])
    expect(diagramText(diagram)).toBe(want)
  })

  it('cuts a long text between characters', () => {
    const nodes = Array.from({ length: 200 }, (_, i) => `{id: n${i}, label: "nodo è ${i}"}`).join(', ')
    const text = diagramText(parseDiagram(`kind: flow\nnodes: [${nodes}]`).diagram)
    expect(new TextEncoder().encode(text.slice(0, -1)).length).toBeLessThanOrEqual(1500)
    expect(text.endsWith('…')).toBe(true)
  })
})

// The schema checks the shape of what an agent writes. Every valid example
// passes it; the invalid ones whose problem is a shape fail it. The others
// (an id used twice, an edge to no node, a Gantt's dates and chains) only
// the reader sees.
describe('diagramSchema', () => {
  const ajv = new Ajv({ allErrors: true, allowUnionTypes: true })
  const validate = ajv.compile(diagramSchema)
  const root = join(__dirname, 'fixtures')
  const read = (dir: string, f: string) => parseYaml(readFileSync(join(root, dir, f), 'utf8'))

  it.each(readdirSync(join(root, 'valid')))('passes valid/%s', (f) => {
    expect(validate(read('valid', f)), JSON.stringify(validate.errors)).toBe(true)
  })

  it.each([
    'flow-bad-id.yaml',
    'flow-bad-shape.yaml',
    'flow-edge-bad.yaml',
    'flow-node-field.yaml',
    'flow-no-nodes.yaml',
    'flow-other-field.yaml',
    'gantt-no-length.yaml',
    'kind-missing.yaml',
    'kind-unknown.yaml',
    'link-bad.yaml',
    'matrix-both.yaml',
    'matrix-item-out.yaml',
    'matrix-three-quadrants.yaml',
    'tree-no-root.yaml',
    'venn-one-set.yaml',
    'version-2.yaml',
  ])('refuses invalid/%s', (f) => {
    expect(validate(read('invalid', f))).toBe(false)
  })
})
