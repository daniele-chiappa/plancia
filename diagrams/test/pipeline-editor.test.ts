// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { PipelineEditor, PipelineView, readPipeline, type NodeTypeInfo, type RunState } from '../src'

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

const CATALOG: NodeTypeInfo[] = [
  {
    type: 'note.write',
    group: 'base',
    description: 'Writes a note',
    input_schema: { type: 'object', required: ['path'], properties: { path: { type: 'string' }, body: { type: 'string', format: 'multiline' }, mode: { type: 'string', enum: ['upsert', 'create'] } } },
    output_schema: { type: 'object', properties: { path: { type: 'string' } } },
  },
  {
    type: 'llm.chat',
    group: 'base',
    input_schema: { type: 'object', properties: { prompt: { type: 'string', format: 'multiline' }, max_tokens: { type: 'integer' } } },
    output_schema: { type: 'object', properties: { text: { type: 'string', description: 'The answer' } } },
  },
  { type: 'docling.convert', group: 'docling', input_schema: { type: 'object', properties: { file: { type: 'string' } } } },
]

const SRC = 'trigger: {on: manual}\nnodes:\n  - {id: ask, use: llm.chat, with: {prompt: Hello}}\n  - {id: write, use: note.write, with: {path: out}}\n'

function host(initial: string, extra: Record<string, unknown> = {}) {
  const source = ref(initial)
  const Host = defineComponent({
    setup: () => () => h(PipelineEditor, { source: source.value, catalog: CATALOG, 'onUpdate:source': (s: string) => (source.value = s), ...extra }),
  })
  return { source, w: mount(Host, { attachTo: document.body }) }
}
const settle = async () => {
  await flushPromises()
  await nextTick()
  await flushPromises()
}
const nodeEl = (w: ReturnType<typeof mount>, id: string) => w.findAll('.vue-flow__node').find((n) => n.attributes('data-id') === id)!

describe('PipelineEditor', () => {
  it('adds a node from the node types, selected, and its settings come from its schema', async () => {
    const { source, w } = host(SRC)
    await settle()
    await w.find('[data-action="add-node"]').trigger('click')
    expect(w.findAll('.pd-palette__group').map((g) => g.text())).toEqual(['Base', 'docling'])
    await w.find('.pd-palette__menu [data-type="docling.convert"]').trigger('click')
    expect(source.value).toContain('  - {id: convert, use: docling.convert}\n')
    await settle()
    expect((w.find('.pd-pipeline__panel [data-field="id"]').element as HTMLInputElement).value).toBe('convert')
    await w.find('[data-field="with-file"]').setValue('{{ trigger.file }}')
    expect(source.value).toContain('{id: convert, use: docling.convert, with: {file: "{{ trigger.file }}"}}')
    w.unmount()
  })

  it('edits a node chosen on the drawing: a text, a choice, a number, its id', async () => {
    const { source, w } = host(SRC)
    await settle()
    await nodeEl(w, 'write').trigger('click')
    await settle()
    await w.find('[data-field="with-mode"]').setValue('create')
    expect(source.value).toContain('{id: write, use: note.write, with: {path: out, mode: create}}')
    await w.find('[data-field="with-body"]').setValue('one\ntwo')
    expect(source.value).toContain('    with:\n      path: out\n      mode: create\n      body: |-\n        one\n        two\n')
    const id = w.find('.pd-pipeline__panel [data-field="id"]')
    await id.setValue('save')
    await id.trigger('change')
    expect(readPipeline(source.value).pipeline!.nodes.map((n) => n.id)).toEqual(['ask', 'save'])
    await nodeEl(w, 'ask').trigger('click')
    await settle()
    const tokens = w.find('[data-field="with-max_tokens"]')
    await tokens.setValue('200')
    await tokens.trigger('blur')
    expect(source.value).toContain('max_tokens: 200')
    w.unmount()
  })

  it('offers the references of the nodes before, and puts one in', async () => {
    const { source, w } = host(SRC)
    await settle()
    await nodeEl(w, 'write').trigger('click')
    await settle()
    const path = w.find('[data-field="with-path"]')
    const el = path.element as HTMLInputElement
    el.value = 'out/{{ as'
    el.setSelectionRange(9, 9)
    await path.trigger('input')
    await settle()
    expect(w.findAll('.pd-expr__list li').map((li) => li.attributes('data-ref'))).toEqual(['ask', 'ask.text'])
    await path.trigger('keydown', { key: 'ArrowDown' })
    await path.trigger('keydown', { key: 'Enter' })
    expect(source.value).toContain('path: "out/{{ ask.text }}"')
    w.unmount()
  })

  it('sets the trigger, deletes a node with Delete, and undoes it', async () => {
    const { source, w } = host(SRC)
    await settle()
    await nodeEl(w, 'trigger').trigger('click')
    await settle()
    await w.find('[data-field="trigger-on"]').setValue('schedule')
    await settle()
    await w.find('[data-field="trigger-every"]').setValue('day 18:30')
    await w.find('[data-field="trigger-every"]').trigger('change')
    expect(source.value.startsWith('trigger: {on: schedule, every: day 18:30}\n')).toBe(true)
    await nodeEl(w, 'ask').trigger('click')
    ;(w.find('.plancia-pipeline-editor').element as HTMLElement).focus()
    await w.find('.plancia-pipeline-editor').trigger('keydown', { key: 'Delete' })
    expect(readPipeline(source.value).pipeline!.nodes.map((n) => [n.id, n.after])).toEqual([['write', []]])
    await w.find('[data-action="undo"]').trigger('click')
    expect(readPipeline(source.value).pipeline!.nodes.map((n) => n.id)).toEqual(['ask', 'write'])
    w.unmount()
  })

  it('offers every trigger of the server, and the fields of commit and run', async () => {
    const { source, w } = host(SRC)
    await settle()
    await nodeEl(w, 'trigger').trigger('click')
    await settle()
    const menu = w.findAll('[data-field="trigger-on"] option').map((o) => o.attributes('value'))
    expect(menu).toEqual(['manual', 'external', 'chat', 'ingest', 'schedule', 'in', 'commit', 'run'])
    await w.find('[data-field="trigger-on"]').setValue('commit')
    await settle()
    await w.find('[data-field="trigger-folder"]').setValue('documents')
    await w.find('[data-field="trigger-folder"]').trigger('change')
    await w.find('[data-field="trigger-skip"]').setValue('pipelines/import, pipelines/cut')
    await w.find('[data-field="trigger-skip"]').trigger('change')
    expect(source.value.startsWith('trigger: {on: commit, folder: documents, skip: [pipelines/import, pipelines/cut]}\n')).toBe(true)
    await w.find('[data-field="trigger-on"]').setValue('run')
    await settle()
    expect(w.find('[data-field="trigger-folder"]').exists()).toBe(false)
    await w.find('[data-field="trigger-status"]').setValue('failed, canceled')
    await w.find('[data-field="trigger-status"]').trigger('change')
    expect(source.value.startsWith('trigger: {on: run, status: [failed, canceled]}\n')).toBe(true)
    w.unmount()
  })

  it('takes the menu from the consumer, and keeps a trigger it does not list', async () => {
    const { w } = host('trigger: {on: webhook}\nnodes:\n  - {id: a, use: note.write, with: {path: x}}\n', { triggerKinds: ['manual', 'schedule'] })
    await settle()
    await nodeEl(w, 'trigger').trigger('click')
    await settle()
    const opts = w.findAll('[data-field="trigger-on"] option')
    expect(opts.map((o) => o.attributes('value'))).toEqual(['manual', 'schedule', 'webhook'])
    expect(opts[2]!.text()).toBe('webhook')
    w.unmount()
  })

  it('shows how the nodes went in a run, and the server’s problem', async () => {
    const run: RunState = { status: 'failed', steps: { ask: { status: 'done', output: { text: 'Hi' } }, write: { status: 'failed', error: 'no access' } } }
    const { w } = host(SRC, { run, problems: ['node "write": there is no node type "note.write"'] })
    await settle()
    expect(nodeEl(w, 'write').find('.pd-pnode').attributes('data-status')).toBe('failed')
    expect(nodeEl(w, 'ask').text()).toContain('Done')
    await nodeEl(w, 'write').trigger('click')
    await settle()
    expect(w.find('[data-run-step]').text()).toContain('no access')
    expect(w.find('[data-server-problem]').text()).toContain('The server would not run it: node "write"')
    w.unmount()
  })
})

describe('PipelineView', () => {
  it('draws a pipeline read-only, its run, and a node’s output on a click', async () => {
    const run: RunState = { status: 'done', steps: { ask: { status: 'done', output: { text: 'Hi' } } } }
    const w = mount(PipelineView, { props: { source: SRC, catalog: CATALOG, run }, attachTo: document.body })
    await settle()
    expect(w.findAll('.pd-pnode')).toHaveLength(3)
    expect(w.find('[data-action="add-node"]').exists()).toBe(false)
    await nodeEl(w, 'ask').trigger('click')
    await settle()
    expect(w.find('[data-run-step]').text()).toContain('"text": "Hi"')
    w.unmount()
  })
})
