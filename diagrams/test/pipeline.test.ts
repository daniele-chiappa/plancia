import { describe, expect, it } from 'vitest'
import { readPipeline, editPipeline, PipelineEditError, exprSuggestions, exprAt, completeExpr, pipelineGraph, type PipelineOp } from '../src'

const ARRIVALS = `# Describes each image that arrives.
trigger: {on: ingest, kinds: [png, jpg], folder: inbox}
nodes:
  - id: describe
    use: llm.describe
    with:
      image: "{{ trigger.file }}"
      prompt: Describe the image in Italian.
  - id: file
    use: note.write
    with:
      path: "archive/{{ trigger.stem }}"
      body: |
        ![[{{ trigger.file }}]]

        {{ describe.text }}
`

const CHAIN = `nodes:
  - {id: a, use: starlark, with: {code: "output = 1"}}
  - {id: b, use: starlark}
  - {id: c, use: starlark}
`

/** Applies ops, checks the result reads without problems, and gives it. */
function apply(src: string, ops: PipelineOp | PipelineOp[]) {
  const r = editPipeline(src, ops)
  const read = readPipeline(r.source)
  expect(read.problems, r.source).toEqual([])
  return { ...r, p: read.pipeline! }
}
const afters = (src: string) => Object.fromEntries(readPipeline(src).pipeline!.nodes.map((n) => [n.id, n.after]))

describe('readPipeline', () => {
  it('reads a pipeline: trigger, nodes, after from the order', () => {
    const { pipeline, problems } = readPipeline(ARRIVALS)
    expect(problems).toEqual([])
    expect(pipeline!.trigger).toEqual({ on: 'ingest', kinds: ['png', 'jpg'], folder: 'inbox', every: '' })
    expect(pipeline!.nodes.map((n) => [n.id, n.use, n.after, n.afterWritten, n.line])).toEqual([
      ['describe', 'llm.describe', [], false, 4],
      ['file', 'note.write', ['describe'], false, 9],
    ])
    expect(pipeline!.nodes[1]!.with.body).toContain('{{ describe.text }}')
  })

  it('reads the map form, and says what is wrong on its line', () => {
    const r = readPipeline('nodes:\n  a: {use: starlark}\n  b: {use: starlark, after: [a, zz]}\n  Bad: {}\n')
    expect(r.pipeline!.form).toBe('map')
    expect(r.problems).toEqual([
      { line: 4, message: 'node Bad: the id is lowercase letters, digits and _, starting with a letter' },
      { line: 4, message: 'node Bad: use names the node type' },
      { line: 3, message: 'node b: after names "zz", which is not a node' },
    ])
    expect(readPipeline('nodes: [').pipeline).toBeNull()
  })
})

describe('editPipeline', () => {
  it('leaves the text as written without operations', () => {
    expect(editPipeline(ARRIVALS, [])).toEqual({ source: ARRIVALS, changed: false, ids: [] })
  })

  it('adds a node after the last, with an id from its type, and moves it', () => {
    const r = apply(ARRIVALS, [
      { op: 'addNode', use: 'docling.convert' },
      { op: 'addNode', use: 'note.write' },
      { op: 'move', positions: { convert: { x: 10.4, y: 20 } } },
    ])
    expect(r.ids).toEqual(['convert', 'write'])
    expect(r.source).toContain(
      '  - id: convert\n    use: docling.convert\n  - id: write\n    use: note.write\nlayout:\n  convert: {x: 10, y: 20}\n',
    )
    expect(afters(r.source)).toMatchObject({ convert: ['file'], write: ['convert'] })
    expect(r.source.startsWith(ARRIVALS.slice(0, ARRIVALS.indexOf('nodes:')))).toBe(true)
  })

  it('writes a new node like the one before it: on several lines after one written so', () => {
    const block = 'nodes:\n  - id: a\n    use: note.write\n    with:\n      path: out\n'
    const r = apply(block, [
      { op: 'addNode', use: 'note.write' },
      { op: 'setWith', id: 'write', key: 'path', value: 'copies' },
    ])
    expect(r.source).toBe(`${block}  - id: write\n    use: note.write\n    with:\n      path: copies\n`)
    expect(apply('nodes: []\n', { op: 'addNode', use: 'starlark' }).source).toBe('nodes:\n  - {id: starlark, use: starlark}\n')
  })

  it('connects and disconnects, writing after out', () => {
    const one = apply(CHAIN, { op: 'connect', from: 'a', to: 'c' })
    expect(one.source).toContain('{id: c, use: starlark, after: [b, a]}')
    const two = apply(one.source, { op: 'disconnect', from: 'b', to: 'c' })
    expect(afters(two.source)).toEqual({ a: [], b: ['a'], c: ['a'] })
    // From the trigger: starts at once.
    const three = apply(CHAIN, { op: 'connect', from: 'trigger', to: 'b' })
    expect(afters(three.source)).toEqual({ a: [], b: [], c: ['b'] })
    expect(() => editPipeline(CHAIN, { op: 'connect', from: 'c', to: 'c' })).toThrow(PipelineEditError)
  })

  it('takes a node away: what came after it waits for what it waited for', () => {
    const r = apply(CHAIN, { op: 'removeNode', id: 'b' })
    // c came after b, which came after a: the order still reads c after a.
    expect(r.source).toBe('nodes:\n  - {id: a, use: starlark, with: {code: "output = 1"}}\n  - {id: c, use: starlark}\n')
    const first = apply(CHAIN, { op: 'removeNode', id: 'a' })
    expect(afters(first.source)).toEqual({ b: [], c: ['b'] })
    const parallel = apply('nodes:\n  - {id: a, use: starlark}\n  - {id: b, use: starlark, after: []}\n  - {id: c, use: starlark, after: [a, b]}\nlayout:\n  b: {x: 1, y: 2}\n', {
      op: 'removeNode',
      id: 'b',
    })
    expect(afters(parallel.source)).toEqual({ a: [], c: ['a'] })
    expect(parallel.source).not.toContain('layout')
    // b waited for nothing: the node after it in the list starts at once now.
    const lone = apply('nodes:\n  - {id: a, use: starlark}\n  - {id: b, use: starlark, after: []}\n  - {id: c, use: starlark}\n', { op: 'removeNode', id: 'b' })
    expect(afters(lone.source)).toEqual({ a: [], c: [] })
  })

  it('renames a node where it is waited for, in the references to it and in layout:', () => {
    const src = ARRIVALS + 'layout:\n  describe: {x: 0, y: 0}\n'
    const r = apply(src, { op: 'renameNode', id: 'describe', to: 'look' })
    expect(r.source).toContain('  - id: look\n')
    expect(r.source).toContain('        {{ look.text }}\n')
    expect(r.source).toContain('layout:\n  look: {x: 0, y: 0}\n')
    expect(() => editPipeline(src, { op: 'renameNode', id: 'describe', to: 'file' })).toThrow('taken')
    expect(() => editPipeline(src, { op: 'renameNode', id: 'describe', to: 'run' })).toThrow('no id')
  })

  it('sets the settings: a text in place, several lines as a block, a removal', () => {
    const r = apply(ARRIVALS, [
      { op: 'setWith', id: 'describe', key: 'prompt', value: 'In English.' },
      { op: 'setWith', id: 'file', key: 'mode', value: 'create' },
      { op: 'setWith', id: 'file', key: 'body', value: 'one\ntwo\n' },
      { op: 'setWith', id: 'file', key: 'path', value: undefined },
    ])
    expect(r.source).toContain('      prompt: In English.\n')
    expect(r.source).toContain('      body: |\n        one\n        two\n      mode: create\n')
    expect(r.source).not.toContain('archive/')
    const flow = apply(CHAIN, { op: 'setWith', id: 'b', key: 'code', value: 'x = 1\noutput = x\n' })
    expect(flow.source).toContain('  - id: b\n    use: starlark\n    with:\n      code: |\n        x = 1\n        output = x\n')
  })

  it('sets the common fields, the retry and the trigger', () => {
    const r = apply(ARRIVALS, [
      { op: 'setNodeField', id: 'describe', field: 'timeout', value: '2m' },
      { op: 'setNodeField', id: 'describe', field: 'on_error', value: 'continue' },
      { op: 'setRetry', id: 'describe', attempts: 3, backoff: '30s' },
      { op: 'setTrigger', on: 'schedule', every: 'monday 09:00' },
    ])
    expect(r.source).toContain('trigger: {on: schedule, every: monday 09:00}\n')
    expect(r.source).toContain('    timeout: 2m\n    on_error: continue\n    retry: {attempts: 3, backoff: 30s}\n')
    const none = apply('nodes:\n  - {id: a, use: starlark}\n', { op: 'setTrigger', on: 'ingest', kinds: ['pdf'] })
    expect(none.source).toBe('trigger: {on: ingest, kinds: [pdf]}\nnodes:\n  - {id: a, use: starlark}\n')
  })

  it('works on the map form too', () => {
    const src = 'nodes:\n  a: {use: starlark}\n  b: {use: note.write}\n'
    const r = apply(src, [
      { op: 'renameNode', id: 'a', to: 'first' },
      { op: 'addNode', use: 'starlark' },
      { op: 'removeNode', id: 'b' },
    ])
    expect(r.source).toBe('nodes:\n  first: {use: starlark}\n  starlark: {use: starlark}\n')
  })
})

describe('expressions', () => {
  const catalog = [
    { type: 'llm.describe', group: 'base', output_schema: { type: 'object', properties: { text: { type: 'string', description: 'The answer' }, usage: { type: 'object', properties: { prompt_tokens: { type: 'integer' } } } } } },
  ]

  it('offers the trigger, the run and the outputs of the nodes before', () => {
    const p = readPipeline(ARRIVALS).pipeline!
    const refs = exprSuggestions(p, 'file', catalog).map((s) => s.ref)
    expect(refs).toContain('trigger.stem')
    expect(refs).toContain('run.resume_url')
    expect(refs).toContain('describe.text')
    expect(refs).toContain('describe.usage.prompt_tokens')
    expect(exprSuggestions(p, 'describe', catalog).map((s) => s.ref)).not.toContain('describe.text')
  })

  it('completes the reference being typed', () => {
    expect(exprAt('a {{ desc', 9)).toEqual({ query: 'desc', start: 5 })
    expect(exprAt('a {{ x }} b', 11)).toBeNull()
    expect(completeExpr('a {{ desc', 9, 'describe.text')).toEqual({ text: 'a {{ describe.text }}', cursor: 21 })
    expect(completeExpr('{{', 2, 'trigger.file')).toEqual({ text: '{{ trigger.file }}', cursor: 18 })
    expect(completeExpr('{{ de }} rest', 5, 'describe')).toEqual({ text: '{{ describe }} rest', cursor: 14 })
  })
})

describe('pipelineGraph', () => {
  it('draws the trigger, the nodes and their afters', () => {
    const g = pipelineGraph(readPipeline('nodes:\n  - {id: a, use: x}\n  - {id: b, use: y, after: []}\n  - {id: c, use: z, after: [a, b]}\n').pipeline!)
    expect(g.nodes.map((n) => n.id)).toEqual(['trigger', 'a', 'b', 'c'])
    expect(g.edges.map((e) => e.id)).toEqual(['trigger->a', 'trigger->b', 'a->c', 'b->c'])
  })
})
