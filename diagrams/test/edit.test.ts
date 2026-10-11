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

describe('sets and areas (venn)', () => {
  const src = fixture('venn-3.yaml')

  it('add a set in the full form, rename one written as its id as a mapping', () => {
    const r = apply(src, [
      { op: 'addSet', label: 'Orders' },
      { op: 'updateSet', id: 'Quotes', label: 'Offers' },
    ])
    expect(r.ids).toEqual(['s1'])
    expect(r.source).toContain('  - {id: Quotes, label: Offers}\n')
    expect(r.source).toContain('  - {id: s1, label: Orders}\n')
    expect(gone(src, r.source)).toEqual(['  - Quotes'])
  })

  it('take a set out of its areas; an area left as another one goes', () => {
    const r = apply(src, { op: 'removeSet', id: 'inv' })
    expect(r.d.sets.map((s) => s.id)).toEqual(['con', 'Quotes'])
    // [inv, con] is [con] now, [inv, con, Quotes] the same as [con, Quotes], which stays.
    expect(r.d.areas.map((a) => [a.sets, a.label])).toEqual([
      [['con'], 'Framework agreements'],
      [['con', 'Quotes'], 'Accepted quotes'],
    ])
  })

  it('add, change and take away areas, a size of 0 leaving it out', () => {
    const r = apply(src, [
      { op: 'updateArea', index: 0, label: 'Frameworks', size: 0 },
      { op: 'updateArea', index: 1, sets: ['inv', 'Quotes'] },
      { op: 'removeArea', index: 2 },
      { op: 'addArea', sets: ['con', 'Quotes'], label: 'Signed' },
    ])
    expect(r.source).toContain('  - {sets: [inv, con], label: "Frameworks"}\n')
    expect(r.source).toContain('  - {sets: [inv, Quotes], label: "Accepted quotes"}\n')
    expect(r.source.trimEnd().endsWith('  - {sets: [con, Quotes], label: Signed}')).toBe(true)
  })
})

describe('quadrants and points (matrix)', () => {
  const src = fixture('matrix-eisenhower.yaml')

  it('change the axes and a quadrant in place', () => {
    const r = apply(src, [
      { op: 'setAxis', axis: 'x', high: 'Very urgent' },
      { op: 'setQuadrant', index: 2, label: 'Later' },
    ])
    expect(gone(src, r.source)).toEqual([
      'x: {label: Urgency, low: Not urgent, high: Urgent}',
      'quadrants: [Plan, Do now, Drop, Delegate]',
    ])
    expect(r.source).toContain('x: {label: Urgency, low: Not urgent, high: Very urgent}')
    expect(r.source).toContain('quadrants: [Plan, Do now, Later, Delegate]')
  })

  it('an axis written as its label stays a text until it gets an end', () => {
    const one = apply('kind: matrix\nx: U\ny: I\nquadrants: [a, b, c, d]\nitems: []\n', { op: 'setAxis', axis: 'y', label: 'Importance' })
    expect(one.source).toContain('y: Importance\n')
    const two = apply(one.source, { op: 'setAxis', axis: 'x', low: 'Low' })
    expect(two.source).toContain('x: {label: U, low: Low}\n')
  })

  it('move, add and take away points, rounded and kept from 0 to 1', () => {
    const r = apply(src, [
      { op: 'updateItem', index: 0, x: 0.333, y: 1.4 },
      { op: 'removeItem', index: 2 },
      { op: 'addItem', label: 'Call', x: 0.5, y: 0.5 },
    ])
    expect(r.d.matrix!.items.map((i) => [i.label, i.x, i.y])).toEqual([
      ['Release v2.76', 0.33, 1],
      ['Tidy the hot file', 0.3, 0.6],
      ['Call', 0.5, 0.5],
    ])
  })

  it('a point added to items: [] goes on a line of its own', () => {
    const r = apply('kind: matrix\nx: U\ny: I\nquadrants: [a, b, c, d]\nitems: []\n', { op: 'addItem', label: 'A', x: 0.2, y: 0.4 })
    expect(r.source).toBe('kind: matrix\nx: U\ny: I\nquadrants: [a, b, c, d]\nitems:\n  - {label: A, x: 0.2, y: 0.4}\n')
  })
})

describe('the grid (matrix)', () => {
  const src = fixture('matrix-grid.yaml')

  it('renames rows and columns, sets cells, a short row padded', () => {
    const short = src.replace('  - [Opportunities, Threats]', '  - [Opportunities]')
    const r = apply(short, [
      { op: 'renameRow', index: 0, label: 'Inside' },
      { op: 'renameColumn', index: 1, label: 'Hurts' },
      { op: 'setCell', row: 1, column: 1, text: 'Threats' },
      { op: 'setCell', row: 0, column: 0, text: 'Strong' },
    ])
    expect(r.source).toContain('rows: [Inside, External]')
    expect(r.source).toContain('columns: [Helpful, Hurts]')
    expect(r.source).toContain('  - [Strong, Weaknesses]\n  - [Opportunities, Threats]\n')
  })

  it('adds and takes away rows and columns with their cells', () => {
    const r = apply(src, [
      { op: 'addColumn', index: 1, label: 'Neutral' },
      { op: 'addRow', index: 0, label: 'Top' },
      { op: 'removeRow', index: 2 },
      { op: 'removeColumn', index: 0 },
    ])
    expect(r.d.matrix).toMatchObject({ rows: ['Top', 'Internal'], columns: ['Neutral', 'Harmful'], cells: [[], ['', 'Weaknesses']] })
  })

  it('refuses a cell outside the grid', () => {
    expect(() => editDiagram(src, { op: 'setCell', row: 5, column: 0, text: 'x' })).toThrow('no cell 5, 0')
  })
})

describe('tasks and sections (gantt)', () => {
  const src = fixture('gantt-sections.yaml')
  const ref = (section: number, index: number) => ({ section, index })

  it('change a task in place: start and after, end and days replace each other', () => {
    const r = apply(src, [
      { op: 'updateTask', task: ref(0, 1), start: '2026-10-10' },
      { op: 'updateTask', task: ref(0, 0), days: 2 },
      { op: 'updateTask', task: ref(1, 0), status: '', label: 'The plugins' },
    ])
    expect(r.source).toContain('{id: nodes, label: "Base nodes", start: 2026-10-10, days: 1, status: done}')
    expect(r.source).toContain('{id: runner, label: "Job runner", start: 2026-10-08, days: 2, status: done}')
    expect(r.source).toContain('{id: plugins, label: "The plugins", after: nodes, days: 2, link: "[[gosidian/docs/improvements/IMP-168]]"}')
  })

  it('add a task with an id, move it, and take one away: what came after it comes after what it came after', () => {
    const r = apply(src, [
      { op: 'addTask', section: 0, index: 2, label: 'Docs', after: 'nodes', days: 1 },
      { op: 'moveTask', task: ref(0, 2), section: 1, index: 0 },
      { op: 'removeTask', task: ref(0, 1) },
    ])
    expect(r.ids).toEqual(['t1'])
    const tasks = r.d.sections.map((s) => s.tasks.map((t) => [t.id || t.label, t.start || t.after]))
    expect(tasks).toEqual([
      [['runner', '2026-10-08']],
      [
        ['t1', 'runner'],
        ['plugins', 'runner'],
        ['Release', 'plugins'],
      ],
    ])
  })

  it('a task taken away that started gives its start to the ones after it', () => {
    const r = apply(src, { op: 'removeTask', task: ref(0, 0) })
    expect(r.d.sections[0]!.tasks[0]).toMatchObject({ id: 'nodes', start: '2026-10-08', after: '' })
  })

  it('tasks without sections become the first section when one is added', () => {
    const tasks = fixture('gantt-tasks.yaml')
    const r = apply(tasks, [
      { op: 'addSection', index: 1, label: 'Later' },
      { op: 'addTask', section: 1, index: 0, label: 'Follow up', start: '2026-11-20', days: 1 },
    ])
    expect(r.source).toBe(
      '# Tasks without sections.\nkind: gantt\nsections:\n  - tasks:\n' +
        '      - {id: a, label: Draft, start: 2026-11-02, days: 3}\n' +
        '      - {id: b, label: Review, after: a, days: 2, status: critical}\n' +
        '      - {label: Go live, start: 2026-11-09, status: milestone}\n' +
        '  - label: Later\n    tasks:\n      - {id: t1, label: Follow up, start: 2026-11-20, days: 1}\n',
    )
  })

  it('rename and take away sections, never the last', () => {
    const r = apply(src, [
      { op: 'renameSection', index: 1, label: 'Release 2' },
      { op: 'removeSection', index: 0 },
    ])
    expect(r.d.sections.map((s) => s.label)).toEqual(['Release 2'])
    expect(r.d.sections[0]!.tasks[0]).toMatchObject({ id: 'plugins', start: '2026-10-08' })
    expect(() => editDiagram(r.source, { op: 'removeSection', index: 0 })).toThrow('one section at least')
  })
})
