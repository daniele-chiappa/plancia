// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { DiagramEditor, findDiagramBlocks, replaceDiagramBlock, diagramTemplate, readyTemplates, parseDiagram, DIAGRAM_KINDS } from '../src'

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

/** The editor with its v-model, as a page has it. */
function host(initial: string) {
  const source = ref(initial)
  const Host = defineComponent({
    setup: () => () => h(DiagramEditor, { source: source.value, 'onUpdate:source': (s: string) => (source.value = s) }),
  })
  return { source, w: mount(Host, { attachTo: document.body }) }
}
const settle = async () => {
  await flushPromises()
  await nextTick()
}

describe('DiagramEditor', () => {
  it('adds a node from the bar, and undoes it', async () => {
    const { source, w } = host('kind: flow\nnodes: [a, b]\nedges: ["a -> b"]\n')
    await settle()
    await w.find('[data-action="add-node"]').trigger('click')
    expect(source.value).toBe('kind: flow\nnodes: [a, b, {id: n1, label: New node}]\nedges: ["a -> b"]\n')
    // The new node is selected: its label is in the panel.
    await settle()
    const label = w.find('.pd-editor__panel [data-field="label"]')
    expect((label.element as HTMLInputElement).value).toBe('New node')
    await label.setValue('Approved')
    expect(source.value).toContain('{id: n1, label: Approved}')
    await w.find('[data-action="undo"]').trigger('click')
    expect(source.value).toBe('kind: flow\nnodes: [a, b, {id: n1, label: New node}]\nedges: ["a -> b"]\n')
    await w.find('[data-action="undo"]').trigger('click')
    expect(source.value).toBe('kind: flow\nnodes: [a, b]\nedges: ["a -> b"]\n')
    await w.find('[data-action="redo"]').trigger('click')
    expect(source.value).toContain('n1')
    w.unmount()
  })

  it('edits the YAML as text, and lists its problems', async () => {
    const { source, w } = host('kind: flow\nnodes: [a]\n')
    await settle()
    await w.find('[data-tab="yaml"]').trigger('click')
    await w.find('textarea').setValue('kind: flow\nnodes: [a]\nedges: ["a -> z"]\n')
    expect(source.value).toContain('a -> z')
    await settle()
    expect(w.find('.pd-editor__problems').text()).toContain('which is no node or group')
    await w.find('[data-tab="drawing"]').trigger('click')
    w.unmount()
  })

  it('edits a mind map as lines: a rename, and Enter adds a branch after', async () => {
    const { source, w } = host('kind: mindmap\nroot: R\nchildren:\n  - A: [x]\n  - B\n')
    await settle()
    const inputs = w.findAll('.pd-outline__input')
    expect(inputs.map((i) => (i.element as HTMLInputElement).value)).toEqual(['R', 'A', 'x', 'B'])
    await inputs[2]!.setValue('y')
    expect(source.value).toContain('  - A: [y]')
    await inputs[1]!.trigger('keydown', { key: 'Enter' })
    expect(parseDiagram(source.value).diagram!.root!.children.map((c) => c.label)).toEqual(['A', 'New branch', 'B'])
    w.unmount()
  })

  it('edits a Venn as a form: a set renamed, a set added, a shared part with its sets', async () => {
    const { source, w } = host('kind: venn\nsets: [A, B]\n')
    await settle()
    await w.findAll('[data-field="set-label"]')[0]!.setValue('Apples')
    expect(source.value).toBe('kind: venn\nsets: [{id: A, label: Apples}, B]\n')
    await w.find('[data-action="add-set"]').trigger('click')
    await w.find('[data-action="add-area"]').trigger('click')
    expect(source.value).toBe('kind: venn\nsets: [{id: A, label: Apples}, B, {id: s1, label: New set}]\nareas:\n  - {sets: [A, B]}\n')
    await settle()
    // s1 joins the part: A ∩ B ∩ s1.
    await w.findAll('[data-row="area"] input[type="checkbox"]')[2]!.setValue(true)
    expect(parseDiagram(source.value).diagram!.areas[0]!.sets).toEqual(['A', 'B', 's1'])
    w.unmount()
  })

  it('edits a quadrant matrix: an axis, a point added, then moved by the drawing and deleted with Delete', async () => {
    const { source, w } = host('kind: matrix\nx: U\ny: I\nquadrants: [a, b, c, d]\nitems: []\n')
    await settle()
    await w.find('[data-field="x-high"]').setValue('Urgent')
    expect(source.value).toContain('x: {label: U, high: Urgent}\n')
    await w.find('[data-action="add-item"]').trigger('click')
    expect(source.value).toContain('items:\n  - {label: New point, x: 0.5, y: 0.5}\n')
    await settle()
    // The drawing beside the form: the point is there, selected, and drags.
    expect(w.find('.pd-editor__preview [data-item="0"] circle[r="7"]').attributes('stroke-width')).toBe('3')
    await w.find('[data-field="item-x"]').setValue('0.9')
    expect(parseDiagram(source.value).diagram!.matrix!.items[0]).toMatchObject({ x: 0.9, y: 0.5 })
    ;(w.find('.plancia-diagram-editor').element as HTMLElement).focus()
    await w.find('.plancia-diagram-editor').trigger('keydown', { key: 'Delete' })
    expect(source.value).toContain('items: []\n')
    w.unmount()
  })

  it('edits a grid as a table: a cell, a row and a column', async () => {
    const { source, w } = host('kind: matrix\nrows: [In, Out]\ncolumns: [Good, Bad]\ncells:\n  - [S, W]\n  - [O, T]\n')
    await settle()
    await w.find('[data-field="cell-1-0"]').setValue('Chances')
    expect(source.value).toContain('  - [Chances, T]\n')
    await w.find('[data-action="add-column"]').trigger('click')
    await w.find('[data-action="add-row"]').trigger('click')
    expect(parseDiagram(source.value).diagram!.matrix).toMatchObject({ rows: ['In', 'Out', 'New row'], columns: ['Good', 'Bad', 'New column'] })
    w.unmount()
  })

  it('edits a Gantt as a table: a task added after the last, a start made after another, a status', async () => {
    const { source, w } = host('kind: gantt\ntasks:\n  - {label: Draft, start: 2026-11-02, days: 3}\n')
    await settle()
    await w.find('[data-action="add-task"]').trigger('click')
    // The last task gets an id, so the new one comes after it.
    expect(source.value).toBe('kind: gantt\ntasks:\n  - {id: t1, label: Draft, start: 2026-11-02, days: 3}\n  - {id: t2, label: New task, after: t1, days: 1}\n')
    await settle()
    const rows = w.findAll('[data-row="task"]')
    await rows[1]!.find('[data-field="task-status"]').setValue('critical')
    await rows[1]!.find('[data-field="task-end-mode"]').setValue('end')
    expect(source.value).toContain('{id: t2, label: New task, after: t1, end: 2026-11-05, status: critical}')
    await rows[0]!.find('[data-field="task-days"]').setValue('4')
    expect(source.value).toContain('{id: t1, label: Draft, start: 2026-11-02, days: 4}')
    await w.find('[data-action="add-section"]').trigger('click')
    expect(source.value).toContain('sections:\n  - tasks:\n')
    w.unmount()
  })

  it('imports a pasted Mermaid in place of the diagram, and says what it left out', async () => {
    const { source, w } = host('kind: tree\nroot: R\n')
    await settle()
    await w.find('[data-action="import"]').trigger('click')
    await w.find('[data-field="import"]').setValue('flowchart LR\n  a --> b\n  style a fill:#f00\n')
    await w.find('[data-action="import-apply"]').trigger('click')
    await vi.waitFor(() => expect(source.value).toBe('kind: flow\ndirection: LR\nnodes: [a, b]\nedges:\n  - a -> b\n'))
    await settle()
    expect(w.find('.pd-editor__notes').text()).toContain('styles are not kept')
    await w.find('[data-action="undo"]').trigger('click')
    expect(source.value).toBe('kind: tree\nroot: R\n')
    w.unmount()
  })

  it('says a YAML that does not read', async () => {
    const broken = host('kind: flow\nnodes: [a\n')
    await settle()
    expect(broken.w.text()).toContain('The YAML does not read')
    broken.w.unmount()
  })
})

describe('findDiagramBlocks', () => {
  it('finds the blocks as the server does, a sample in a fence left out', () => {
    const md = '# N\n\n````md\n```diagram\nkind: venn\n```\n````\n\n```diagram\nkind: tree\nroot: A\n```\n\n~~~diagram\nkind: tree\nroot: B\n~~~~\n\n```diagram\nunclosed\n'
    const blocks = findDiagramBlocks(md)
    expect(blocks.map((b) => [b.source, b.line])).toEqual([
      ['kind: tree\nroot: A\n', 9],
      ['kind: tree\nroot: B\n', 14],
    ])
    const out = replaceDiagramBlock(md, blocks[1]!, 'kind: tree\nroot: C')
    expect(out).toBe(md.replace('root: B\n', 'root: C\n'))
  })
})

describe('diagramTemplate', () => {
  it.each(DIAGRAM_KINDS.map((k) => [k]))('gives a %s that reads', (k) => {
    const { diagram, problems } = parseDiagram(diagramTemplate(k, { root: 'Tema: uno', cause: 'Una "causa"' }, '2026-10-11'))
    expect(problems).toEqual([])
    expect(diagram!.kind).toBe(k)
  })
})

describe('readyTemplates', () => {
  const ready = readyTemplates({ yes: 'sì', complete: 'Completi?', swot: ['Forze', 'Debolezze', 'Opportunità', 'Minacce: "esterne"'] }, { low: 'Bassa' }, '2026-10-11')

  it.each(ready.map((t) => [t.id, t]))('gives a %s that reads, of its kind', (_, t) => {
    const { diagram, problems } = parseDiagram(t.source)
    expect(problems).toEqual([])
    expect(diagram!.kind).toBe(t.kind)
  })

  it('has every kind, in the words given', () => {
    expect(new Set(ready.map((t) => t.kind))).toEqual(new Set(DIAGRAM_KINDS))
    const swot = parseDiagram(ready.find((t) => t.id === 'swot')!.source).diagram!
    expect(swot.matrix!.cells).toEqual([['Forze', 'Debolezze'], ['Opportunità', 'Minacce: "esterne"']])
    expect(parseDiagram(ready.find((t) => t.id === 'process')!.source).diagram!.edges[2]!.label).toBe('sì')
    expect(ready.find((t) => t.id === 'project')!.source).toContain('start: 2026-10-11')
  })
})
