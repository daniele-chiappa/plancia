// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { DiagramEditor, DiagramView, PipelineEditor, DEFAULT_DIAGRAM_LABELS, type FlowA11yLabels } from '../src'

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
