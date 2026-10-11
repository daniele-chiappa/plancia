import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { editDiagram, parseDiagram, DiagramEditError, type DiagramOp } from '../src'

const fixtures = join(__dirname, 'fixtures', 'valid')
const fixture = (f: string) => readFileSync(join(fixtures, f), 'utf8')

/** Applies ops, checks the result reads without problems, and gives it. */
function apply(src: string, ops: DiagramOp | DiagramOp[]) {
  const r = editDiagram(src, ops)
  const { diagram, problems } = parseDiagram(r.source)
  expect(problems, r.source).toEqual([])
  return { ...r, d: diagram! }
}

/** The lines of a that are not in b. */
const gone = (a: string, b: string) => a.split('\n').filter((l) => !b.split('\n').includes(l))

describe('editDiagram leaves the text as written', () => {
  it.each(readdirSync(fixtures))('%s without operations', (f) => {
    const src = fixture(f)
    expect(editDiagram(src, [])).toEqual({ source: src, changed: false, ids: [] })
  })

  it('refuses a diagram that does not read', () => {
    expect(() => editDiagram('kind: nope', [])).toThrow(DiagramEditError)
    expect(() => editDiagram('kind: flow\nnodes: [a', [])).toThrow(DiagramEditError)
  })

  it('refuses what is not there, and applies nothing', () => {
    expect(() => editDiagram(fixture('flow-short.yaml'), { op: 'removeNode', id: 'zz' })).toThrow('no node zz')
  })
})

describe('positions', () => {
  const src = fixture('flow-short.yaml')

  it('go to layout:, rounded, the rest untouched', () => {
    const r = apply(src, { op: 'move', positions: { start: { x: 10.4, y: 20.6 }, check: { x: 200, y: 20 } } })
    expect(r.source).toBe(`${src}layout:\n  start: {x: 10, y: 21}\n  check: {x: 200, y: 20}\n`)
    expect(r.d.layout).toEqual({ start: { x: 10, y: 21, w: 0, h: 0 }, check: { x: 200, y: 20, w: 0, h: 0 } })
  })

  it('change in place, keeping a size', () => {
    const r = apply(fixture('flow-full.yaml'), { op: 'move', positions: { plugin: { x: 1, y: 2 } } })
    expect(r.source).toContain('  plugin: {x: 1, y: 2, w: 180, h: 100}')
    expect(gone(fixture('flow-full.yaml'), r.source)).toEqual(['  plugin: {x: 200, y: 90, w: 180, h: 100}'])
  })

  it('go away with relayout', () => {
    const r = apply(fixture('flow-full.yaml'), { op: 'relayout' })
    expect(r.d.layout).toBeUndefined()
    expect(r.source).not.toContain('layout:')
    expect(r.source).toContain('# A flow in the full form')
  })

  it('are no change when they are the same', () => {
    const r = editDiagram(fixture('flow-full.yaml'), { op: 'move', positions: { convert: { x: 240, y: 120 } } })
    expect(r.changed).toBe(false)
  })
})

describe('nodes', () => {
  const src = fixture('flow-short.yaml')

  it('are added in the full form, with an id of their own', () => {
    const r = apply(src, { op: 'addNode', label: 'Nuovo passo', shape: 'decision' })
    expect(r.ids).toEqual(['n1'])
    expect(r.source).toContain('nodes: [start, check, done, {id: n1, label: Nuovo passo, shape: decision}]')
    expect(r.d.nodes.map((n) => n.id)).toEqual(['start', 'check', 'done', 'n1'])
  })

  it('written as their id become a mapping only when they get more', () => {
    expect(editDiagram(src, { op: 'updateNode', id: 'check', label: 'check' }).changed).toBe(false)
    const r = apply(src, { op: 'updateNode', id: 'check', label: 'Check it', class: 'ext' })
    expect(r.source).toContain('nodes: [start, {id: check, label: Check it, class: ext}, done]')
  })

  it('keep their quotes and other fields when a field changes', () => {
    const r = apply(fixture('flow-full.yaml'), { op: 'updateNode', id: 'upload', label: 'Carica', class: '' })
    expect(r.source).toContain('  - {id: upload, label: "Carica", shape: pill}')
    expect(gone(fixture('flow-full.yaml'), r.source)).toHaveLength(1)
  })

  it('take their edges, their group and their position with them', () => {
    const r = apply(fixture('flow-full.yaml'), { op: 'removeNode', id: 'convert' })
    expect(r.d.nodes.map((n) => n.id)).not.toContain('convert')
    expect(r.d.edges.map((e) => `${e.from}>${e.to}`)).toEqual(['pictures>describe', 'pictures>note', 'describe>note'])
    expect(r.d.groups[0]!.nodes).toEqual([])
    expect(r.d.layout).toEqual({ plugin: { x: 200, y: 90, w: 180, h: 100 } })
  })
})

describe('edges', () => {
  const src = fixture('flow-short.yaml')

  it('are added in the full form', () => {
    const r = apply(src, { op: 'addEdge', from: 'done', to: 'start', label: 'again' })
    expect(r.source).toContain('  - {from: done, to: start, label: again}')
  })

  it('keep their short form for a label, become a mapping for a style', () => {
    const a = apply(src, { op: 'updateEdge', edge: { from: 'check', to: 'done' }, label: 'fine' })
    expect(a.source).toContain('  - "check -> done: fine"')
    const b = apply(src, { op: 'updateEdge', edge: { from: 'start', to: 'check' }, label: '' })
    expect(b.changed).toBe(false)
    const c = apply(src, { op: 'updateEdge', edge: { from: 'check', to: 'start' }, style: 'dashed' })
    expect(c.source).toContain('  - {from: check, to: start, label: retry, style: dashed}')
    expect(c.d.edges[2]).toMatchObject({ style: 'dashed', label: 'retry' })
  })

  it('are found among the same ends by their order', () => {
    const two = `${src}  - "check -> done: again"\n`
    const r = apply(two, { op: 'removeEdge', edge: { from: 'check', to: 'done', nth: 1 } })
    expect(r.source).toBe(src)
  })
})

describe('groups', () => {
  const src = fixture('flow-full.yaml')

  it('hold a node in one group at a time', () => {
    const r = apply(src, [
      { op: 'addGroup', label: 'Out', nodes: ['note'] },
      { op: 'setGroup', node: 'convert', group: 'g1' },
    ])
    expect(r.ids).toEqual(['g1'])
    expect(r.d.groups.map((g) => [g.id, g.nodes])).toEqual([
      ['plugin', []],
      ['g1', ['note', 'convert']],
    ])
  })

  it('go with the edges that join them', () => {
    const r = apply(src, [{ op: 'addEdge', from: 'upload', to: 'plugin' }, { op: 'removeGroup', id: 'plugin' }])
    expect(r.d.groups).toEqual([])
    expect(r.d.edges.some((e) => e.to === 'plugin')).toBe(false)
    expect(r.d.layout).toEqual({ convert: { x: 240, y: 120, w: 0, h: 0 } })
  })
})

describe('branches', () => {
  const src = fixture('mindmap-short.yaml')
  const labels = (d: ReturnType<typeof apply>['d']) => {
    const out: string[] = []
    const walk = (b: NonNullable<typeof d.root>, depth: number) => {
      out.push(`${'.'.repeat(depth)}${b.label}`)
      b.children.forEach((c) => walk(c, depth + 1))
    }
    walk(d.root!, 0)
    return out.join(' ')
  }

  it('are renamed in their own form', () => {
    const r = apply(src, [
      { op: 'renameBranch', path: [0], label: 'Arrivo' },
      { op: 'renameBranch', path: [0, 1], label: 'Word' },
      { op: 'renameBranch', path: [], label: 'Archivio' },
    ])
    expect(r.source).toContain('root: Archivio')
    expect(r.source).toContain('  - Arrivo: [PDF, Word, Images]')
    expect(r.source).toContain('# Branches as {Label: [children]}, leaves as texts.')
  })

  it('get children and siblings; a leaf that gets a child is {Label: [child]}', () => {
    const r = apply(src, [
      { op: 'addBranch', parent: [2], index: 0, label: 'Monthly' },
      { op: 'addBranch', parent: [], index: 1, label: 'Archive rules' },
      { op: 'addBranch', parent: [0], index: 3, label: 'Mail' },
    ])
    expect(labels(r.d)).toBe(
      'Archive .Arrival ..PDF ..DOCX ..Images ..Mail .Archive rules .Search ..Text ..Similarity ...Embeddings ...Questions .Reports ..Monthly',
    )
    expect(r.source).toContain('  - Reports: [Monthly]')
  })

  it('go, and a branch left without children is a text again', () => {
    const one = 'kind: tree\nroot: R\nchildren:\n  - A: [x]\n  - B\n'
    const r = apply(one, { op: 'removeBranch', path: [0, 0] })
    expect(r.source).toBe('kind: tree\nroot: R\nchildren:\n  - A\n  - B\n')
  })

  it('move: indent under the branch before, outdent after the parent, up and down', () => {
    // Text goes under Arrival, then back out after Search, then up first.
    const a = apply(src, { op: 'moveBranch', path: [1, 0], parent: [0], index: 3 })
    expect(labels(a.d)).toBe('Archive .Arrival ..PDF ..DOCX ..Images ..Text .Search ..Similarity ...Embeddings ...Questions .Reports')
    const b = apply(a.source, { op: 'moveBranch', path: [0, 3], parent: [], index: 2 })
    expect(labels(b.d)).toBe('Archive .Arrival ..PDF ..DOCX ..Images .Search ..Similarity ...Embeddings ...Questions .Text .Reports')
    const c = apply(b.source, { op: 'moveBranch', path: [2], parent: [], index: 0 })
    expect(labels(c.d)).toBe('Archive .Text .Arrival ..PDF ..DOCX ..Images .Search ..Similarity ...Embeddings ...Questions .Reports')
    // Down by one in its own list.
    const d = apply(c.source, { op: 'moveBranch', path: [0], parent: [], index: 2 })
    expect(labels(d.d)).toBe('Archive .Arrival ..PDF ..DOCX ..Images .Text .Search ..Similarity ...Embeddings ...Questions .Reports')
  })

  it('indented under a leaf of a list in line make it {Leaf: [child]} there', () => {
    const r = apply(src, [
      { op: 'addBranch', parent: [0], index: 2, label: 'Mail' },
      { op: 'moveBranch', path: [0, 2], parent: [0, 1], index: 0 },
    ])
    expect(r.source).toContain('  - Arrival: [PDF, {DOCX: [Mail]}, Images]')
  })

  it('do not go under themselves', () => {
    expect(() => editDiagram(src, { op: 'moveBranch', path: [1], parent: [1, 1], index: 0 })).toThrow('under itself')
  })

  it('get a link in the full form', () => {
    const r = apply(src, [
      { op: 'setBranchLink', path: [2], link: '[[p/reports]]' },
      { op: 'setBranchLink', path: [1, 1], link: 'https://example.com' },
    ])
    expect(r.d.root!.children[2]).toMatchObject({ label: 'Reports', link: '[[p/reports]]' })
    expect(r.d.root!.children[1]!.children[1]).toMatchObject({ label: 'Similarity', link: 'https://example.com' })
    expect(r.d.root!.children[1]!.children[1]!.children.map((c) => c.label)).toEqual(['Embeddings', 'Questions'])
  })

  it('of a full form keep it', () => {
    const tree = fixture('tree-org.yaml')
    const r = apply(tree, [
      { op: 'renameBranch', path: [1], label: 'Front' },
      { op: 'addBranch', parent: [1], index: 2, label: 'CSS' },
      { op: 'setBranchLink', path: [1], link: '' },
    ])
    expect(r.source).toContain('  - label: Front\n    id: front\n    children:\n      - Vue\n      - plancia\n      - CSS')
    expect(gone(tree, r.source)).toEqual(['  - label: Frontend', '    link: "[[team/frontend]]"'])
  })
})
