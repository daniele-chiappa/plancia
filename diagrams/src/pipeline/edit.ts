import { parseDocument, isMap, isPair, isScalar, isSeq, visit, Pair, Scalar, YAMLMap, YAMLSeq, type Document } from 'yaml'
import { readPipeline } from './read'
import { TRIGGER_ID } from './types'
import type { LayoutPosition } from '../edit/edit'

// The pipeline editor's changes to a ```pipeline block (IMP-169, F4), on
// the yaml library's Document as editDiagram does: what they do not touch
// stays as written (comments, flow or block collections, the order of the
// fields, the list or map form of the nodes); what they add is plain YAML;
// positions go to layout:, which the server ignores. With nothing changed
// the text comes back as it was.
//
// `after` keeps its meaning: unset, a node waits for the one before it. An
// operation that would change that silently writes it out: a node taken
// away hands the nodes after it to what it waited for.

export type PipelineOp =
  | { op: 'move'; positions: Record<string, LayoutPosition> }
  | { op: 'relayout' }
  | { op: 'addNode'; use: string; id?: string; at?: LayoutPosition; with?: Record<string, unknown> }
  | { op: 'removeNode'; id: string }
  | { op: 'connect'; from: string; to: string }
  | { op: 'disconnect'; from: string; to: string }
  | { op: 'renameNode'; id: string; to: string }
  | { op: 'setUse'; id: string; use: string }
  | { op: 'setWith'; id: string; key: string; value: unknown }
  | { op: 'setNodeField'; id: string; field: 'when' | 'unless' | 'each' | 'timeout' | 'on_error'; value: string }
  | { op: 'setRetry'; id: string; attempts?: number; backoff?: string }
  | {
      op: 'setTrigger'
      on?: string
      kinds?: string[]
      folder?: string
      every?: string
      match?: string
      batch?: boolean
      skip?: string[]
      status?: string[]
      pipelines?: string
    }

export interface PipelineEditResult {
  source: string
  changed: boolean
  /** The ids the operations gave to the nodes they added, in order. */
  ids: string[]
}

/** An operation that cannot apply: the YAML does not read, or what it names is not there. */
export class PipelineEditError extends Error {}

const STRINGIFY = { lineWidth: 0, flowCollectionPadding: false } as const
const idRe = /^[a-z][a-z0-9_]*$/
const RESERVED = ['trigger', 'run', 'item', 'index']

/** A value as text: a Scalar's, or a plain value set in this edit. */
const text = (n: unknown): string => {
  if (isScalar(n)) return n.value === null || n.value === undefined ? '' : String(n.value)
  return typeof n === 'string' || typeof n === 'number' || typeof n === 'boolean' ? String(n) : ''
}

interface Entry {
  id: string
  map: YAMLMap
  index: number
}

class Editor {
  private doc: Document
  private root: YAMLMap
  changed = false
  ids: string[] = []

  constructor(source: string) {
    const r = readPipeline(source)
    if (!r.pipeline) throw new PipelineEditError('the pipeline does not read: fix it in the YAML first')
    this.doc = parseDocument(source)
    if (this.doc.errors.length || !isMap(this.doc.contents)) throw new PipelineEditError('the pipeline does not read: fix it in the YAML first')
    this.root = this.doc.contents
  }

  toString(): string {
    return this.doc.toString(STRINGIFY)
  }

  private touch() {
    this.changed = true
  }

  // --- the nodes, in either form ---

  private nodesNode(create = false): YAMLSeq | YAMLMap | null {
    const n = this.root.get('nodes', true)
    if (isSeq(n) || isMap(n)) return n
    if (!create) return null
    const s = new YAMLSeq()
    this.root.set('nodes', s)
    return s
  }

  private entries(): Entry[] {
    const n = this.nodesNode()
    if (isSeq(n)) {
      return n.items.flatMap((it, index) => (isMap(it) ? [{ id: text(it.get('id', true)), map: it, index }] : []))
    }
    if (isMap(n)) {
      return n.items.flatMap((p, index) => (isPair(p) && isMap(p.value) ? [{ id: text(p.key), map: p.value, index }] : []))
    }
    return []
  }

  private entry(id: string): Entry {
    const e = this.entries().find((x) => x.id === id)
    if (!e) throw new PipelineEditError(`no node ${id}`)
    return e
  }

  /** What a node waits for, as the server reads it. */
  private afterOf(e: Entry, all = this.entries()): string[] {
    const a = e.map.get('after', true)
    if (isSeq(a)) return a.items.map(text).filter(Boolean)
    if (isScalar(a)) return text(a) ? [text(a)] : []
    const i = all.findIndex((x) => x.id === e.id)
    return i > 0 ? [all[i - 1]!.id] : []
  }

  /** Writes a node's after out, as a list on one line. */
  private setAfter(e: Entry, after: string[]) {
    const cur = e.map.get('after', true)
    if (isSeq(cur) && cur.items.map(text).join('\u0000') === after.join('\u0000')) return
    const seq = this.doc.createNode(after, { flow: true }) as YAMLSeq
    if (isSeq(cur)) cur.items = seq.items
    else e.map.set('after', seq)
    this.touch()
  }

  private fresh(base: string): string {
    const taken = new Set(this.entries().map((e) => e.id))
    // The trailing underscores go by hand: /_+$/ is quadratic on a long
    // run of them that something follows.
    let b = base.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^[^a-z]+/, '')
    let end = b.length
    while (end > 0 && b[end - 1] === '_') end--
    b = b.slice(0, end) || 'node'
    if (RESERVED.includes(b)) b = `${b}_node`
    if (!taken.has(b)) return b
    let i = 2
    while (taken.has(`${b}_${i}`)) i++
    return `${b}_${i}`
  }

  addNode(use: string, id?: string, at?: LayoutPosition, withValues?: Record<string, unknown>): string {
    if (!use) throw new PipelineEditError('a node has a type')
    const nid = id && idRe.test(id) && !this.entries().some((e) => e.id === id) ? id : this.fresh(use.split('.').pop() ?? use)
    const n = this.nodesNode(true)!
    const fields: Record<string, unknown> = { use }
    if (withValues && Object.keys(withValues).length) fields.with = withValues
    // On one line like the node before it, or when it is the first; on
    // several like a node before it written so, or with settings.
    const last: unknown = n.items.at(-1)
    const prev = isSeq(n) ? last : isPair(last) ? last.value : null
    const flow = !fields.with && (!isMap(prev) || !!prev.flow)
    if (isSeq(n)) {
      if (n.flow && n.items.length === 0) n.flow = false
      const m = this.doc.createNode({ id: nid, ...fields }) as YAMLMap
      m.flow = flow
      n.items.push(m)
    } else {
      const m = this.doc.createNode(fields) as YAMLMap
      m.flow = flow
      n.items.push(new Pair(this.doc.createNode(nid), m))
    }
    this.touch()
    if (at) this.move({ [nid]: at })
    return nid
  }

  removeNode(id: string) {
    const all = this.entries()
    const e = all.find((x) => x.id === id)
    if (!e) throw new PipelineEditError(`no node ${id}`)
    const waited = this.afterOf(e, all)
    // What each node will wait for: the same as now, the node taken away
    // replaced by what it waited for, so the order goes on.
    const want = new Map<string, string[]>()
    for (const x of all) {
      if (x.id === id) continue
      const before = this.afterOf(x, all)
      want.set(x.id, before.includes(id) ? [...new Set(before.flatMap((a) => (a === id ? waited : [a])))].filter((a) => a !== x.id) : before)
    }
    this.nodesNode()!.items.splice(e.index, 1)
    this.touch()
    // after is written where the order alone would now read another one.
    const rest = this.entries()
    for (const x of rest) {
      const w = want.get(x.id) ?? []
      if (this.afterOf(x, rest).join('\u0000') !== w.join('\u0000')) this.setAfter(x, w)
    }
    this.dropLayout(id)
  }

  connect(from: string, to: string) {
    if (from === to) throw new PipelineEditError('a node cannot come after itself')
    const all = this.entries()
    const e = all.find((x) => x.id === to)
    if (!e) throw new PipelineEditError(`no node ${to}`)
    if (from === TRIGGER_ID) {
      // From the trigger: the node starts at once, when the run does.
      this.setAfter(e, [])
      return
    }
    if (!all.some((x) => x.id === from)) throw new PipelineEditError(`no node ${from}`)
    const after = this.afterOf(e, all)
    if (after.includes(from)) return
    this.setAfter(e, [...after, from])
  }

  disconnect(from: string, to: string) {
    if (from === TRIGGER_ID) return
    const all = this.entries()
    const e = all.find((x) => x.id === to)
    if (!e) throw new PipelineEditError(`no node ${to}`)
    const after = this.afterOf(e, all)
    if (!after.includes(from)) return
    this.setAfter(
      e,
      after.filter((a) => a !== from),
    )
  }

  renameNode(id: string, to: string) {
    if (id === to) return
    if (!idRe.test(to) || RESERVED.includes(to)) throw new PipelineEditError(`"${to}" is no id: lowercase letters, digits and _, starting with a letter`)
    const all = this.entries()
    if (all.some((x) => x.id === to)) throw new PipelineEditError(`the id ${to} is taken`)
    const e = all.find((x) => x.id === id)
    if (!e) throw new PipelineEditError(`no node ${id}`)
    const n = this.nodesNode()!
    if (isSeq(n)) {
      const cur = e.map.get('id', true)
      if (isScalar(cur)) cur.value = to
      else e.map.set('id', to)
    } else {
      const pair = n.items[e.index] as Pair
      if (isScalar(pair.key)) pair.key.value = to
      else pair.key = this.doc.createNode(to)
    }
    // Its name where it is waited for, in the references to it, in layout:.
    for (const x of all) {
      const a = x.map.get('after', true)
      if (isSeq(a)) {
        for (const it of a.items) if (isScalar(it) && text(it) === id) it.value = to
      } else if (isScalar(a) && text(a) === id) a.value = to
      visit(x.map, {
        Scalar: (key, s) => {
          if (key === 'key' || typeof s.value !== 'string') return
          const re = new RegExp(`(\\{\\{\\s*)${id}(?=[\\s.}])`, 'g')
          if (re.test(s.value)) s.value = s.value.replace(re, `$1${to}`)
        },
      })
    }
    const layout = this.root.get('layout', true)
    if (isMap(layout) && layout.has(id)) {
      const v = layout.get(id, true)
      layout.delete(id)
      layout.set(to, v)
    }
    this.touch()
  }

  setUse(id: string, use: string) {
    if (!use) throw new PipelineEditError('a node has a type')
    this.setText(this.entry(id).map, 'use', use)
  }

  private setText(map: YAMLMap, key: string, value: string) {
    const cur = map.get(key, true)
    if (value === '') {
      if (map.has(key)) {
        map.delete(key)
        this.touch()
      }
      return
    }
    if (isScalar(cur) && text(cur) === value) return
    if (isScalar(cur)) cur.value = value
    else map.set(key, value)
    this.touch()
  }

  setWith(id: string, key: string, value: unknown) {
    const e = this.entry(id)
    let w: unknown = e.map.get('with', true)
    if (value === undefined || value === '') {
      if (isMap(w) && w.has(key)) {
        w.delete(key)
        if (w.items.length === 0) e.map.delete('with')
        this.touch()
      }
      return
    }
    if (!isMap(w)) {
      w = new YAMLMap()
      ;(w as YAMLMap).flow = e.map.flow ?? false
      e.map.set('with', w)
    }
    const map = w as YAMLMap
    const cur = map.get(key, true)
    if (isScalar(cur) && typeof value !== 'object' && cur.value === value) return
    if (typeof value === 'string' && value.includes('\n')) {
      // A text of several lines is a block: |, and its mappings blocks too.
      e.map.flow = false
      map.flow = false
      if (isScalar(cur)) {
        cur.value = value
        cur.type = Scalar.BLOCK_LITERAL
      } else {
        const s = this.doc.createNode(value) as Scalar
        s.type = Scalar.BLOCK_LITERAL
        map.set(key, s)
      }
    } else if (isScalar(cur) && typeof value !== 'object') {
      cur.value = value
      if (cur.type === Scalar.BLOCK_LITERAL || cur.type === Scalar.BLOCK_FOLDED) cur.type = undefined
    } else {
      const n = this.doc.createNode(value)
      if (isSeq(n) && n.items.every(isScalar)) n.flow = true
      map.set(key, n)
    }
    this.touch()
  }

  setNodeField(id: string, field: string, value: string) {
    this.setText(this.entry(id).map, field, value.trim())
  }

  setRetry(id: string, attempts?: number, backoff?: string) {
    const e = this.entry(id)
    if (!attempts && !backoff) {
      if (e.map.has('retry')) {
        e.map.delete('retry')
        this.touch()
      }
      return
    }
    const want: Record<string, unknown> = {}
    if (attempts) want.attempts = attempts
    if (backoff) want.backoff = backoff
    const cur = e.map.get('retry', true)
    if (isMap(cur) && JSON.stringify(cur.toJSON()) === JSON.stringify(want)) return
    e.map.set('retry', this.doc.createNode(want, { flow: true }))
    this.touch()
  }

  setTrigger(f: {
    on?: string
    kinds?: string[]
    folder?: string
    every?: string
    match?: string
    batch?: boolean
    skip?: string[]
    status?: string[]
    pipelines?: string
  }) {
    let t: unknown = this.root.get('trigger', true)
    if (!isMap(t)) {
      t = this.doc.createNode({}, { flow: true })
      // The trigger goes first, as the docs write it.
      this.root.items.unshift(new Pair(this.doc.createNode('trigger'), t))
      this.touch()
    }
    const map = t as YAMLMap
    if (f.on !== undefined) this.setText(map, 'on', f.on)
    if (f.kinds !== undefined) this.setList(map, 'kinds', f.kinds)
    if (f.skip !== undefined) this.setList(map, 'skip', f.skip)
    if (f.status !== undefined) this.setList(map, 'status', f.status)
    if (f.pipelines !== undefined) this.setText(map, 'pipelines', f.pipelines)
    if (f.folder !== undefined) this.setText(map, 'folder', f.folder)
    if (f.every !== undefined) this.setText(map, 'every', f.every)
    if (f.match !== undefined) this.setText(map, 'match', f.match)
    if (f.batch !== undefined) {
      const cur = map.get('batch')
      if (f.batch && cur !== true) {
        map.set('batch', true)
        this.touch()
      } else if (!f.batch && map.has('batch')) {
        map.delete('batch')
        this.touch()
      }
    }
    // The fields of another trigger go: an ingest's kinds on a schedule.
    const on = text(map.get('on', true)) || 'manual'
    const keep: Record<string, string[]> = {
      ingest: ['kinds', 'folder'],
      schedule: ['every'],
      in: ['kinds', 'folder', 'match', 'batch'],
      commit: ['folder', 'match', 'skip'],
      run: ['status', 'pipelines'],
    }
    for (const k of ['kinds', 'folder', 'every', 'match', 'batch', 'skip', 'status', 'pipelines']) {
      if (map.has(k) && !(keep[on] ?? []).includes(k)) {
        map.delete(k)
        this.touch()
      }
    }
  }

  /** setList writes key as a flow list, or deletes it when list is empty. */
  private setList(map: YAMLMap, key: string, list: string[]) {
    const cur = map.get(key, true)
    const now = isSeq(cur) ? cur.items.map(text) : []
    if (list.length === 0) {
      if (map.has(key)) {
        map.delete(key)
        this.touch()
      }
    } else if (now.join('\u0000') !== list.join('\u0000')) {
      map.set(key, this.doc.createNode(list, { flow: true }))
      this.touch()
    }
  }

  // --- layout ---

  move(positions: Record<string, LayoutPosition>) {
    let layout: unknown = this.root.get('layout', true)
    if (!isMap(layout)) {
      layout = new YAMLMap()
      this.root.set('layout', layout)
      this.touch()
    }
    const map = layout as YAMLMap
    for (const [id, p] of Object.entries(positions)) {
      const want: Record<string, number> = { x: Math.round(p.x), y: Math.round(p.y) }
      const cur = map.get(id, true)
      if (isMap(cur)) {
        for (const [k, v] of Object.entries(want)) {
          if (Number(text(cur.get(k, true))) !== v || !cur.has(k)) {
            cur.set(k, v)
            this.touch()
          }
        }
      } else {
        map.set(id, this.doc.createNode(want, { flow: true }))
        this.touch()
      }
    }
  }

  relayout() {
    if (this.root.has('layout')) {
      this.root.delete('layout')
      this.touch()
    }
  }

  private dropLayout(id: string) {
    const layout = this.root.get('layout', true)
    if (isMap(layout) && layout.has(id)) {
      layout.delete(id)
      if (layout.items.length === 0) this.root.delete('layout')
      this.touch()
    }
  }
}

/**
 * Applies operations to a ```pipeline block's YAML and gives the new text;
 * without a change, the text given. Throws PipelineEditError when the YAML
 * does not read or an operation names what is not there.
 */
export function editPipeline(source: string, ops: PipelineOp | PipelineOp[]): PipelineEditResult {
  const e = new Editor(source)
  for (const o of Array.isArray(ops) ? ops : [ops]) {
    switch (o.op) {
      case 'move':
        e.move(o.positions)
        break
      case 'relayout':
        e.relayout()
        break
      case 'addNode':
        e.ids.push(e.addNode(o.use, o.id, o.at, o.with))
        break
      case 'removeNode':
        e.removeNode(o.id)
        break
      case 'connect':
        e.connect(o.from, o.to)
        break
      case 'disconnect':
        e.disconnect(o.from, o.to)
        break
      case 'renameNode':
        e.renameNode(o.id, o.to)
        break
      case 'setUse':
        e.setUse(o.id, o.use)
        break
      case 'setWith':
        e.setWith(o.id, o.key, o.value)
        break
      case 'setNodeField':
        e.setNodeField(o.id, o.field, o.value)
        break
      case 'setRetry':
        e.setRetry(o.id, o.attempts, o.backoff)
        break
      case 'setTrigger':
        e.setTrigger(o)
        break
    }
  }
  if (!e.changed) return { source, changed: false, ids: e.ids }
  const out = e.toString()
  return { source: out, changed: out !== source, ids: e.ids }
}
