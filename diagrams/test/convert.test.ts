// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import mermaid from 'mermaid'
import {
  parseDiagram,
  toMermaid,
  fromMermaid,
  toCanvas,
  fromCanvas,
  DiagramConvertError,
  diagramHash,
  twinHash,
  twinText,
  findTwin,
  findDiagramBlocks,
  writeDiagramBlock,
  type Diagram,
} from '../src'

const read = (src: string): Diagram => {
  const r = parseDiagram(src)
  expect(r.problems).toEqual([])
  return r.diagram!
}
const fixtures = join(__dirname, 'fixtures/valid')
const valid = readdirSync(fixtures).filter((f) => f.endsWith('.yaml'))
const measure = (t: string) => t.length * 7

describe('toMermaid', () => {
  it.each(valid)('%s gives Mermaid that Mermaid reads', async (name) => {
    const d = read(readFileSync(join(fixtures, name), 'utf8'))
    const src = toMermaid(d)
    expect(src).not.toBe('')
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
    await expect(mermaid.parse(src)).resolves.toBeTruthy()
    const portable = toMermaid(d, { portable: true })
    await expect(mermaid.parse(portable)).resolves.toBeTruthy()
    if (d.kind === 'fishbone') expect(portable.startsWith('mindmap')).toBe(true)
  })

  it('writes a flow with its shapes, groups, line styles and classes', () => {
    const d = read(
      'kind: flow\ndirection: LR\nnodes:\n  - {id: end, label: "The \\"end\\"", shape: pill, class: user}\n  - {id: db, label: Store, shape: db}\n  - {id: web, label: Site, link: "https://x.org"}\ngroups:\n  - {id: g, label: Back, nodes: [db]}\nedges:\n  - "end -> db: writes"\n  - {from: db, to: web, style: dotted}\n',
    )
    expect(toMermaid(d)).toBe(
      'flowchart LR\n' +
        '  n0(["The #quot;end#quot;"])\n' +
        '  db[("Store")]\n' +
        '  web["Site"]\n' +
        '  subgraph g["Back"]\n    db\n  end\n' +
        '  n0 -->|"writes"| db\n' +
        '  db -.-> web\n' +
        '  linkStyle 1 stroke-dasharray:1.5 3.5\n' +
        '  classDef user fill:#e3edfd,stroke:#3b82f6\n  class n0 user\n' +
        '  click web href "https://x.org" _blank\n',
    )
  })

  it('writes a Gantt with its last day made Mermaid’s end, and leaves out a task that does not read', () => {
    const d = parseDiagram(
      'kind: gantt\ntitle: "Plan: one"\ntasks:\n  - {id: a, label: "Draft: v1", start: 2026-11-02, end: 2026-11-04, status: critical}\n  - {label: Review, after: a, days: 2}\n  - {label: Lost, after: nowhere, days: 1}\n  - {label: Go, after: a, status: milestone}\n',
    ).diagram!
    expect(toMermaid(d)).toBe(
      'gantt\n  title Plan#58; one\n  dateFormat YYYY-MM-DD\n  tickInterval 1day\n' +
        '    Draft#58; v1 :crit, a, 2026-11-02, 2026-11-05\n' +
        '    Review :after a, 2d\n' +
        '    Go :milestone, after a, 0d\n',
    )
  })

  it('writes the quadrants in Mermaid’s order, and a grid as blocks', () => {
    const q = read('kind: matrix\nx: {label: U, low: Low, high: High}\ny: Importance\nquadrants: [TL, TR, BL, BR]\nitems: [{label: A, x: 0.2, y: 0.9}]\n')
    expect(toMermaid(q)).toBe(
      'quadrantChart\n  x-axis "Low" --> "High"\n  y-axis "Importance"\n  quadrant-1 "TR"\n  quadrant-2 "TL"\n  quadrant-3 "BL"\n  quadrant-4 "BR"\n  "A": [0.2, 0.9]\n',
    )
    const g = read('kind: matrix\nrows: [In, Out]\ncolumns: [Good, Bad]\ncells: [[S, W], [O]]\n')
    expect(toMermaid(g)).toBe(
      'block-beta\n  columns 3\n  space h0["Good"] h1["Bad"]\n  r0["In"] c0_0["S"] c0_1["W"]\n  r1["Out"] c1_0["O"] space\n',
    )
  })
})

describe('fromMermaid', () => {
  it('reads a flowchart: shapes, labels, groups, dotted lines, classes and addresses', async () => {
    const r = await fromMermaid(
      'flowchart LR\n  a([Start]) --> b{OK?}\n  b -->|yes| c[(DB)]\n  b -. no .-> d[/In/]\n  subgraph g1 [Group one]\n    c\n    d\n  end\n  click a "https://x.org"\n  classDef user fill:#fff\n  class a user\n',
    )
    expect(r.source).toBe(
      'kind: flow\ndirection: LR\nnodes:\n' +
        '  - {id: a, label: Start, shape: pill, class: user, link: https://x.org/}\n' +
        '  - {id: b, label: OK?, shape: decision}\n' +
        '  - {id: c, label: DB, shape: db}\n' +
        '  - {id: d, label: In, shape: data}\n' +
        'edges:\n  - a -> b\n  - "b -> c: yes"\n  - {from: b, to: d, label: no, style: dotted}\n' +
        'groups:\n  - {id: g1, label: Group one, nodes: [c, d]}\n',
    )
    expect(r.warnings).toEqual(['styles are not kept'])
    expect(parseDiagram(r.source).problems).toEqual([])
  })

  it('brings a flow back from its own Mermaid', async () => {
    const src = 'kind: flow\nnodes:\n  - {id: a, label: "Arrival: docs", shape: doc}\n  - {id: end, label: Done, shape: circle}\nedges:\n  - "a -> end: ok"\n'
    const r = await fromMermaid(toMermaid(read(src)))
    expect(read(r.source)).toMatchObject({
      nodes: [
        { id: 'a', label: 'Arrival: docs', shape: 'doc' },
        { id: 'n1', label: 'Done', shape: 'circle' },
      ],
      edges: [{ from: 'a', to: 'n1', label: 'ok' }],
    })
  })

  it('reads a mind map as branches in their short forms', async () => {
    const r = await fromMermaid('mindmap\n  root((Archive))\n    Arrival\n      PDF\n      DOCX\n    Search\n')
    expect(r.source).toBe('kind: mindmap\nroot: Archive\nchildren:\n  - Arrival: [PDF, DOCX]\n  - Search\n')
  })

  it('reads a Gantt: sections, after, durations and Mermaid’s end made the last day', async () => {
    const r = await fromMermaid(
      'gantt\n  title P\n  dateFormat YYYY-MM-DD\n  section R1\n    Job runner :done, runner, 2026-10-08, 2026-10-10\n    Base nodes :nodes, after runner, 2d\n  section R2\n    Release :milestone, after nodes, 0d\n',
    )
    expect(r.source).toBe(
      'kind: gantt\ntitle: P\nsections:\n' +
        '  - label: R1\n    tasks:\n' +
        '      - {id: runner, label: Job runner, start: 2026-10-08, end: 2026-10-09, status: done}\n' +
        '      - {id: nodes, label: Base nodes, after: runner, days: 2}\n' +
        '  - label: R2\n    tasks:\n' +
        '      - {label: Release, after: nodes, status: milestone}\n',
    )
    expect(parseDiagram(r.source).problems).toEqual([])
  })

  it('brings a Gantt and a quadrant matrix back from their own Mermaid', async () => {
    for (const name of ['gantt-sections.yaml', 'gantt-tasks.yaml', 'matrix-eisenhower.yaml']) {
      const d = read(readFileSync(join(fixtures, name), 'utf8'))
      const back = read((await fromMermaid(toMermaid(d))).source)
      expect(back.title).toBe(d.title)
      if (d.kind === 'gantt') {
        const tasks = (x: Diagram) => x.sections.flatMap((s) => s.tasks.map((t) => [t.label, t.status, t.after || t.start]))
        expect(tasks(back)).toEqual(tasks(d))
      } else {
        expect(back.matrix!.quadrants).toEqual(d.matrix!.quadrants)
        expect(back.matrix!.items.map((i) => [i.label, i.x, i.y])).toEqual(d.matrix!.items.map((i) => [i.label, i.x, i.y]))
        expect(back.matrix!.x).toMatchObject({ low: d.matrix!.x!.low, high: d.matrix!.x!.high })
      }
    }
  })

  it('says the kinds it does not convert, and Mermaid that does not read', async () => {
    await expect(fromMermaid('sequenceDiagram\n  A->>B: hi\n')).rejects.toThrow(/has no equivalent/)
    await expect(fromMermaid('flowchart TB\n  a -->')).rejects.toBeInstanceOf(DiagramConvertError)
  })
})

describe('JSON Canvas', () => {
  const flow = 'kind: flow\nnodes:\n  - {id: a, label: Start, class: user}\n  - {id: b, label: Plan, link: "[[p/plans/x|the plan]]"}\n  - {id: c, label: Site, link: "https://x.org"}\ngroups:\n  - {id: g, label: Docs, nodes: [b, c]}\nedges:\n  - "a -> b: go"\n  - b -> c\n'

  it('writes a flow as cards, a group around its nodes and connections between facing sides', () => {
    const c = JSON.parse(toCanvas(read(flow), measure))
    expect(c.nodes.map((n: { id: string; type: string }) => [n.id, n.type])).toEqual([
      ['g', 'group'],
      ['a', 'text'],
      ['b', 'text'],
      ['c', 'text'],
    ])
    const [g, a, b, cc] = c.nodes
    expect(a).toMatchObject({ text: 'Start', color: '5' })
    expect(b.text).toBe('[[p/plans/x|Plan]]')
    expect(cc.text).toBe('[Site](https://x.org)')
    for (const n of [b, cc]) {
      expect(n.x).toBeGreaterThanOrEqual(g.x)
      expect(n.y + n.height).toBeLessThanOrEqual(g.y + g.height)
    }
    expect(c.edges[0]).toMatchObject({ fromNode: 'a', toNode: 'b', label: 'go', fromSide: 'bottom', toSide: 'top' })
  })

  it('brings a flow back from its canvas, at the same places', () => {
    const d = read(flow)
    const back = read(fromCanvas(toCanvas(d, measure)).source)
    expect(back.nodes.map((n) => [n.id, n.label, n.link, n.class])).toEqual([
      ['a', 'Start', '', 'user'],
      ['b', 'Plan', '[[p/plans/x]]', ''],
      ['c', 'Site', 'https://x.org', ''],
    ])
    expect(back.groups).toMatchObject([{ id: 'g', label: 'Docs', nodes: ['b', 'c'] }])
    expect(back.edges.map((e) => [e.from, e.to, e.label])).toEqual([
      ['a', 'b', 'go'],
      ['b', 'c', ''],
    ])
    expect(Object.keys(back.layout!)).toEqual(['a', 'b', 'c'])
  })

  it('escapes the backslashes and brackets of a link card, and reads them back', () => {
    const src = 'kind: flow\nnodes:\n  - {id: a, label: "C:\\\\docs [old]\\\\", link: "https://x.org"}\n'
    expect(read(src).nodes[0]!.label).toBe('C:\\docs [old]\\')
    const c = JSON.parse(toCanvas(read(src), measure))
    expect(c.nodes[0].text).toBe('[C:\\\\docs \\[old\\]\\\\](https://x.org)')
    expect(read(fromCanvas(JSON.stringify(c)).source).nodes[0]).toMatchObject({ label: 'C:\\docs [old]\\', link: 'https://x.org' })
  })

  it('reads an Obsidian canvas: file and link cards, ids made valid, and says what it leaves out', () => {
    const r = fromCanvas(
      JSON.stringify({
        nodes: [
          { id: '6f2a9c1d0b3e4f5a', type: 'text', text: '# Arrival\n\nA **new** document', x: 0, y: 0, width: 250, height: 80, color: '1' },
          { id: 'f2', type: 'file', file: 'team/rag.md', subpath: '#Index', x: 400, y: 0, width: 250, height: 60 },
          { id: 'l3', type: 'link', url: 'https://example.com/a', x: 800, y: 0, width: 250, height: 60 },
        ],
        edges: [
          { id: 'e', fromNode: '6f2a9c1d0b3e4f5a', toNode: 'f2', toEnd: 'none' },
          { id: 'x', fromNode: 'f2', toNode: 'gone' },
        ],
      }),
      { title: 'Board' },
    )
    expect(r.source).toBe(
      'kind: flow\ntitle: Board\nnodes:\n' +
        '  - {id: n1, label: "Arrival\\nA new document"}\n' +
        '  - {id: f2, label: rag, shape: doc, link: "[[team/rag#Index]]"}\n' +
        '  - {id: l3, label: example.com/a, link: https://example.com/a}\n' +
        'edges:\n  - n1 -> f2\n' +
        'layout:\n  n1: {x: 0, y: 0, w: 250, h: 80}\n  f2: {x: 400, y: 0, w: 250, h: 60}\n  l3: {x: 800, y: 0, w: 250, h: 60}\n',
    )
    expect(r.warnings).toEqual([
      'colours other than green, cyan and purple are not kept',
      'every connection is an arrow from its first card to its second',
      'a connection to a card that is not there is left out',
    ])
    expect(parseDiagram(r.source).problems).toEqual([])
    const links = fromCanvas(JSON.stringify({ nodes: [{ id: 'a', type: 'text', text: 'See [[p/plans/a#X]] and [[p/b|B]]', x: 0, y: 0, width: 9, height: 9 }] }))
    expect(read(links.source).nodes[0]!.label).toBe('See a and B')
    expect(() => fromCanvas('{')).toThrow(DiagramConvertError)
    expect(() => toCanvas(read('kind: tree\nroot: R\n'))).toThrow(/a flow does/)
  })
})

describe('the twin', () => {
  it('hashes the YAML as the server does, line ends and trailing space aside', () => {
    expect(diagramHash('')).toBe('811c9dc5')
    expect(diagramHash('kind: flow\nnodes: [a]\n')).toBe(diagramHash('kind: flow\r\nnodes: [a]   \n\n'))
    // Go's hash/fnv New32a gives the same.
    expect(diagramHash('kind: flow\nnodes: [à]')).toBe('bc7171d9')
  })

  const note = '# N\n\n```diagram\nkind: tree\nroot: A\n```\n\nAfter.\n'
  const yaml2 = 'kind: tree\nroot: B\n'

  it('writes a twin under the block, again when the YAML changes, and takes it away', () => {
    const b = findDiagramBlocks(note)[0]!
    const twin = twinText(yaml2, 'flowchart TB\n  n0(["B"])\n')
    const one = writeDiagramBlock(note, b, yaml2, twin)
    expect(one).toBe(
      '# N\n\n```diagram\nkind: tree\nroot: B\n```\n\n```mermaid\n' +
        `%% diagram-twin ${diagramHash(yaml2)} — made from the diagram above: change that one\n` +
        'flowchart TB\n  n0(["B"])\n```\n\nAfter.\n',
    )
    const b1 = findDiagramBlocks(one)[0]!
    const t = findTwin(one, b1)!
    expect(twinHash(t.source)).toBe(diagramHash(yaml2))
    // Written again: one twin, the new hash.
    const two = writeDiagramBlock(one, b1, 'kind: tree\nroot: C\n', twinText('kind: tree\nroot: C\n', 'flowchart TB\n'))
    expect(findDiagramBlocks(two, 'mermaid')).toHaveLength(1)
    expect(twinHash(findTwin(two, findDiagramBlocks(two)[0]!)!.source)).toBe(diagramHash('kind: tree\nroot: C\n'))
    // Kept as it is, then taken away.
    expect(writeDiagramBlock(one, b1, yaml2)).toBe(one)
    expect(writeDiagramBlock(one, b1, yaml2, null)).toBe(note.replace('root: A', 'root: B'))
  })

  it('knows a twin only by its mark, right after the block', () => {
    const other = note.replace('After.', '```mermaid\nflowchart TB\n```')
    expect(findTwin(other, findDiagramBlocks(other)[0]!)).toBeNull()
    const far = note.replace('After.', `After.\n\n\`\`\`mermaid\n${twinText('x', 'flowchart TB\n')}\`\`\``)
    expect(findTwin(far, findDiagramBlocks(far)[0]!)).toBeNull()
    const end = '```diagram\nkind: tree\nroot: A\n```'
    expect(writeDiagramBlock(end, findDiagramBlocks(end)[0]!, 'kind: tree\nroot: A\n', 'x\n')).toBe(
      '```diagram\nkind: tree\nroot: A\n```\n\n```mermaid\nx\n```\n',
    )
  })
})
