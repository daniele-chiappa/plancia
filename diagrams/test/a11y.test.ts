// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { DiagramEditor, DiagramView, PipelineEditor, PipelineView, DEFAULT_DIAGRAM_LABELS, type FlowA11yLabels } from '../src'

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

// Vue Flow writes the help its nodes and edges point to in English, and
// names keys these components do not use: the labels say it in the
// reader's language.
const ITALIAN: FlowA11yLabels = {
  nodeHelp: 'Un clic seleziona il nodo e Canc lo toglie.',
  edgeHelp: 'Un clic seleziona il collegamento e Canc lo toglie.',
  nodeRole: 'nodo',
  groupRole: 'gruppo',
  edgeRole: 'collegamento',
  edgeName: (from, to) => `da ${from} a ${to}`,
}

// A test that fails leaves nothing behind for the next one.
const mounted: VueWrapper[] = []
const track = (w: VueWrapper) => (mounted.push(w), w)
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
})

const settle = async () => {
  await flushPromises()
  await nextTick()
  await flushPromises()
}
const text = (prefix: string) => document.querySelector(`[id^="${prefix}"]`)?.textContent?.trim()

describe('the words of Vue Flow', () => {
  it("the editor's help of a node and of an edge, in the labels' words", async () => {
    const source = ref('kind: flow\nnodes: [a, b]\nedges: ["a -> b"]\n')
    const Host = defineComponent({
      setup: () => () =>
        h(DiagramEditor, { source: source.value, labels: ITALIAN, 'onUpdate:source': (s: string) => (source.value = s) }),
    })
    track(mount(Host, { attachTo: document.body }))
    await settle()
    expect(text('vue-flow__node-desc-')).toBe(ITALIAN.nodeHelp)
    expect(text('vue-flow__edge-desc-')).toBe(ITALIAN.edgeHelp)
  })

  it("a drawn diagram's help is English by default, not Vue Flow's own", async () => {
    track(mount(DiagramView, { props: { source: 'kind: flow\nnodes: [a, b]\nedges: ["a -> b"]\n' }, attachTo: document.body }))
    await settle()
    expect(text('vue-flow__node-desc-')).toBe(DEFAULT_DIAGRAM_LABELS.nodeHelp)
  })

  it("the pipeline editor's help too", async () => {
    track(
      mount(PipelineEditor, {
        props: { source: 'trigger: {on: manual}\nnodes:\n  - {id: a, use: note.write}\n', catalog: [], labels: ITALIAN },
        attachTo: document.body,
      }),
    )
    await settle()
    expect(text('vue-flow__node-desc-')).toBe(ITALIAN.nodeHelp)
    expect(text('vue-flow__edge-desc-')).toBe(ITALIAN.edgeHelp)
  })
})

// Vue Flow makes every node and edge of an editor a stop of Tab, with no
// name (an edge's is "Edge from a to b", in English with the ids), and
// selects nothing from the keyboard since these components select
// themselves (BUG-157).
describe('the nodes and the links from the keyboard', () => {
  const FLOW = 'kind: flow\nnodes: [{id: a, label: Inizio}, {id: b, label: Fine}]\nedges: ["a -> b"]\n'
  const node = (id: string) => document.querySelector<HTMLElement>(`.vue-flow__node[data-id="${id}"]`)!
  const press = (el: Element, key: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))

  function editor(source: string) {
    const text = ref(source)
    const Host = defineComponent({
      setup: () => () =>
        h(DiagramEditor, { source: text.value, labels: ITALIAN, 'onUpdate:source': (s: string) => (text.value = s) }),
    })
    return { text, w: track(mount(Host, { attachTo: document.body })) }
  }

  it("names an editor's nodes and links in the labels' words", async () => {
    editor(FLOW)
    await settle()
    expect(node('a').getAttribute('tabindex')).toBe('0')
    expect(node('a').getAttribute('aria-label')).toBe('Inizio')
    expect(node('a').getAttribute('aria-roledescription')).toBe('nodo')
    const edge = document.querySelector('.vue-flow__edge')!
    // As an SVG element reads it: Vue Flow writes tabIndex.
    expect(edge.getAttribute('tabindex')).toBe('0')
    expect(edge.getAttribute('aria-label')).toBe('da Inizio a Fine')
    expect(edge.getAttribute('aria-roledescription')).toBe('collegamento')
  })

  it('selects a node with Enter, as a click does, and Delete removes it', async () => {
    const { text, w } = editor(FLOW)
    await settle()
    node('a').focus()
    press(node('a'), 'Enter')
    await settle()
    expect((w.find('.pd-editor__panel [data-field="label"]').element as HTMLInputElement).value).toBe('Inizio')
    press(node('a'), 'Delete')
    await settle()
    expect(text.value).not.toContain('Inizio')
  })

  it('selects a link with Space', async () => {
    const { w } = editor(FLOW)
    await settle()
    press(document.querySelector('.vue-flow__edge')!, ' ')
    await settle()
    expect(w.find('.pd-edge[data-selected]').exists()).toBe(true)
  })

  it("leaves a drawn diagram's nodes out of Tab, its links named in the labels' words", async () => {
    track(mount(DiagramView, { props: { source: FLOW, labels: ITALIAN }, attachTo: document.body }))
    await settle()
    expect(node('a').hasAttribute('tabindex')).toBe(false)
    expect(node('a').hasAttribute('aria-roledescription')).toBe(false)
    expect(document.querySelector('.vue-flow__edge')!.getAttribute('aria-label')).toBe('da Inizio a Fine')
  })

  const PIPELINE = 'trigger: {on: manual}\nnodes:\n  - {id: a, use: note.write}\n  - {id: b, use: note.write, after: [a]}\n'

  it("names a pipeline editor's nodes, selects one with Enter and reaches its links", async () => {
    const w = track(mount(PipelineEditor, { props: { source: PIPELINE, catalog: [], labels: ITALIAN }, attachTo: document.body }))
    await settle()
    expect(node('a').getAttribute('aria-label')).toBe('a, note.write')
    expect(node('a').getAttribute('aria-roledescription')).toBe('nodo')
    expect(document.querySelector('.vue-flow__edge')!.getAttribute('tabindex')).toBe('0')
    press(node('a'), 'Enter')
    await settle()
    expect(w.find('.pd-pnode[data-selected]').exists()).toBe(true)
  })

  it("leaves a pipeline's nodes out of Tab in its view", async () => {
    track(mount(PipelineView, { props: { source: PIPELINE, labels: ITALIAN }, attachTo: document.body }))
    await settle()
    expect(node('a').hasAttribute('tabindex')).toBe(false)
    expect(document.querySelector('.vue-flow__edge')!.hasAttribute('tabindex')).toBe(false)
  })
})
