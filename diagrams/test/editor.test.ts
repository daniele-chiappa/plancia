// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { DiagramEditor, findDiagramBlocks, replaceDiagramBlock, diagramTemplate, parseDiagram, DIAGRAM_KINDS } from '../src'

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

  it('says the kinds edited in the YAML for now, and a YAML that does not read', async () => {
    const venn = host('kind: venn\nsets: [A, B]\n')
    await settle()
    expect(venn.w.text()).toContain('This kind is edited in the YAML for now.')
    venn.w.unmount()
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
