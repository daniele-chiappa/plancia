import { parseDocument, isMap, isPair, isScalar, isSeq, Pair, Scalar, YAMLMap, YAMLSeq, type Document, type Node as YamlNode } from 'yaml'
import { parseDiagram, readEdge } from '../model/parse'
import type { Diagram, DiagramBranch, EdgeStyle, NodeClass, NodeShape, TaskStatus } from '../model/types'

// The editor's changes to a diagram's YAML (IMP-169, F2). They work on the
// yaml library's Document, which keeps what they do not touch as written:
// comments, short forms ("a -> b", a leaf as a text, {Branch: [children]}),
// the order of the fields, flow or block collections. What they add is in
// the full form; positions go to layout:. With nothing changed the text
// comes back as it was, byte for byte.

/** A position in layout:, the top left corner (and the size) in pixels. */
export interface LayoutPosition {
  x: number
  y: number
  w?: number
  h?: number
}

/** An edge, by its ends and, between the same ends, its order (0 first). */
export interface EdgeRef {
  from: string
  to: string
  nth?: number
}

/** A branch by the indices from the root: [] the root, [1, 0] the first child of its second branch. */
export type BranchPath = number[]

/** A task of a Gantt by its section (0 for tasks without sections) and its place in it. */
export interface TaskRef {
  section: number
  index: number
}

/** The fields of a task an operation sets; '' (0 for days) takes one away. start and after replace each other, end and days too. */
export interface TaskFields {
  /** An id for a task that has none, so another can come after it; an id there stays. */
  id?: string
  label?: string
  start?: string
  after?: string
  end?: string
  days?: number
  status?: TaskStatus | ''
  link?: string
}

export type DiagramOp =
  | { op: 'move'; positions: Record<string, LayoutPosition> }
  | { op: 'relayout' }
  | { op: 'addNode'; label: string; id?: string; shape?: NodeShape; at?: LayoutPosition }
  | { op: 'updateNode'; id: string; label?: string; shape?: NodeShape; class?: NodeClass | ''; link?: string }
  | { op: 'removeNode'; id: string }
  | { op: 'addEdge'; from: string; to: string; label?: string }
  | { op: 'updateEdge'; edge: EdgeRef; label?: string; style?: EdgeStyle }
  | { op: 'removeEdge'; edge: EdgeRef }
  | { op: 'addGroup'; label: string; id?: string; nodes?: string[] }
  | { op: 'updateGroup'; id: string; label: string }
  | { op: 'removeGroup'; id: string }
  | { op: 'setGroup'; node: string; group: string | null }
  | { op: 'renameBranch'; path: BranchPath; label: string }
  | { op: 'setBranchLink'; path: BranchPath; link: string }
  | { op: 'addBranch'; parent: BranchPath; index: number; label: string }
  | { op: 'removeBranch'; path: BranchPath }
  | { op: 'moveBranch'; path: BranchPath; parent: BranchPath; index: number }
  | { op: 'addSet'; label: string; id?: string }
  | { op: 'updateSet'; id: string; label?: string; link?: string }
  | { op: 'removeSet'; id: string }
  | { op: 'addArea'; sets: string[]; label?: string }
  | { op: 'updateArea'; index: number; sets?: string[]; label?: string; size?: number }
  | { op: 'removeArea'; index: number }
  | { op: 'setAxis'; axis: 'x' | 'y'; label?: string; low?: string; high?: string }
  | { op: 'setQuadrant'; index: number; label: string }
  | { op: 'addItem'; label: string; x: number; y: number }
  | { op: 'updateItem'; index: number; label?: string; x?: number; y?: number; link?: string }
  | { op: 'removeItem'; index: number }
  | { op: 'setCell'; row: number; column: number; text: string }
  | { op: 'renameRow'; index: number; label: string }
  | { op: 'renameColumn'; index: number; label: string }
  | { op: 'addRow'; index: number; label: string }
  | { op: 'removeRow'; index: number }
  | { op: 'addColumn'; index: number; label: string }
  | { op: 'removeColumn'; index: number }
  | ({ op: 'addTask'; section: number; index: number; label: string } & Omit<TaskFields, 'label'>)
  | ({ op: 'updateTask'; task: TaskRef } & TaskFields)
  | { op: 'removeTask'; task: TaskRef }
  | { op: 'moveTask'; task: TaskRef; section: number; index: number }
  | { op: 'addSection'; index: number; label: string }
  | { op: 'renameSection'; index: number; label: string }
  | { op: 'removeSection'; index: number }

export interface EditResult {
  source: string
  /** Whether the text changed. */
  changed: boolean
  /** The ids the operations gave to what they added, in order. */
  ids: string[]
}

/** An operation that cannot apply: the YAML does not read, or what it names is not there. */
export class DiagramEditError extends Error {}

const STRINGIFY = { lineWidth: 0, flowCollectionPadding: false } as const
const BRANCH_FIELDS = ['id', 'label', 'link', 'children']

const text = (n: unknown): string => {
  if (isScalar(n)) return n.value === null || n.value === undefined ? '' : String(n.value)
  return ''
}

/** Where a branch's children are: a value read and written in place. */
interface Segment {
  read(): YamlNode | null
  write(n: YamlNode | null): void
}

/** A child in a segment: an item of its list, or the single text it holds. */
interface Slot {
  seg: Segment
  index: number
  single: boolean
}

class Editor {
  private doc: Document
  private root: YAMLMap
  private known: Set<string>
  changed = false
  ids: string[] = []

  constructor(source: string) {
    const d = parseDiagram(source).diagram
    if (!d) throw new DiagramEditError('the diagram does not read: fix it in the YAML first')
    this.doc = parseDocument(source)
    if (this.doc.errors.length || !isMap(this.doc.contents)) {
      throw new DiagramEditError('the diagram does not read: fix it in the YAML first')
    }
    this.root = this.doc.contents
    this.known = knownIds(d)
  }

  toString(): string {
    return this.doc.toString(STRINGIFY)
  }

  private touch() {
    this.changed = true
  }

  private fresh(prefix: string): string {
    let i = 1
    while (this.known.has(`${prefix}${i}`)) i++
    const id = `${prefix}${i}`
    this.known.add(id)
    return id
  }

  /** A flow mapping of fields, the empty ones left out. */
  private fields(f: Record<string, unknown>): YAMLMap {
    const kept = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== ''))
    return this.doc.createNode(kept, { flow: true }) as YAMLMap
  }

  /** The list at a top-level key, made when create and missing. */
  private list(key: string, create: boolean): YAMLSeq | null {
    const v = this.root.get(key, true)
    if (isSeq(v)) return v
    if (!create) return null
    const s = new YAMLSeq()
    this.root.set(key, s)
    return s
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
      if (p.w !== undefined) want.w = Math.round(p.w)
      if (p.h !== undefined) want.h = Math.round(p.h)
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
      this.touch()
      if (layout.items.length === 0) this.root.delete('layout')
    }
  }

  // --- nodes ---

  private nodeIndex(id: string): [YAMLSeq, number] {
    const seq = this.list('nodes', false)
    const i = seq ? seq.items.findIndex((it) => (isMap(it) ? text(it.get('id', true)) : text(it)) === id) : -1
    if (!seq || i < 0) throw new DiagramEditError(`no node ${id}`)
    return [seq, i]
  }

  addNode(label: string, id?: string, shape?: NodeShape, at?: LayoutPosition): string {
    const nid = id && !this.known.has(id) ? id : this.fresh('n')
    this.known.add(nid)
    this.list('nodes', true)!.items.push(this.fields({ id: nid, label, shape: shape === 'box' ? undefined : shape }))
    this.touch()
    if (at) this.move({ [nid]: at })
    return nid
  }

  updateNode(id: string, f: { label?: string; shape?: NodeShape; class?: NodeClass | ''; link?: string }) {
    const [seq, i] = this.nodeIndex(id)
    const item: unknown = seq.items[i]
    if (isScalar(item)) {
      // A node written as its id: a mapping only when it gets more than that.
      const label = f.label !== undefined && f.label !== id ? f.label : undefined
      const shape = f.shape && f.shape !== 'box' ? f.shape : undefined
      if (label === undefined && !shape && !f.class && !f.link) return
      const map = this.fields({ id, label, shape, class: f.class, link: f.link })
      map.commentBefore = item.commentBefore
      map.comment = item.comment
      seq.items[i] = map
      this.touch()
      return
    }
    const map = item as YAMLMap
    this.setField(map, 'label', f.label === id ? '' : f.label)
    this.setField(map, 'shape', f.shape === 'box' ? '' : f.shape)
    this.setField(map, 'class', f.class)
    this.setField(map, 'link', f.link)
  }

  /** Sets a field of a mapping, or takes it away for ''; undefined leaves it. */
  private setField(map: YAMLMap, key: string, value: string | undefined) {
    if (value === undefined) return
    if (value === '') {
      if (map.has(key)) {
        map.delete(key)
        this.touch()
      }
      return
    }
    const cur = map.get(key, true)
    if (isScalar(cur) && text(cur) === value) return
    if (isScalar(cur)) cur.value = value
    else map.set(key, value)
    this.touch()
  }

  removeNode(id: string) {
    const [seq, i] = this.nodeIndex(id)
    seq.items.splice(i, 1)
    this.touch()
    this.removeEdgesOf(id)
    const groups = this.list('groups', false)
    for (const g of groups?.items ?? []) if (isMap(g)) this.dropMember(g, id)
    this.dropLayout(id)
  }

  // --- edges ---

  private edgeEnds(it: unknown): [string, string, string] | null {
    if (isScalar(it)) return readEdge(text(it))
    if (isMap(it)) return [text(it.get('from', true)), text(it.get('to', true)), text(it.get('label', true))]
    return null
  }

  private edgeIndex(ref: EdgeRef): [YAMLSeq, number] {
    const seq = this.list('edges', false)
    let nth = ref.nth ?? 0
    const items = seq?.items ?? []
    for (let i = 0; i < items.length; i++) {
      const ends = this.edgeEnds(items[i])
      if (ends && ends[0] === ref.from && ends[1] === ref.to && nth-- === 0) return [seq!, i]
    }
    throw new DiagramEditError(`no edge ${ref.from} -> ${ref.to}`)
  }

  private removeEdgesOf(id: string) {
    const seq = this.list('edges', false)
    if (!seq) return
    for (let i = seq.items.length - 1; i >= 0; i--) {
      const ends = this.edgeEnds(seq.items[i])
      if (ends && (ends[0] === id || ends[1] === id)) {
        seq.items.splice(i, 1)
        this.touch()
      }
    }
  }

  addEdge(from: string, to: string, label?: string) {
    this.list('edges', true)!.items.push(this.fields({ from, to, label }))
    this.touch()
  }

  updateEdge(ref: EdgeRef, f: { label?: string; style?: EdgeStyle }) {
    const [seq, i] = this.edgeIndex(ref)
    const item = seq.items[i]
    if (isScalar(item)) {
      const [from, to, label] = this.edgeEnds(item)!
      const nextLabel = f.label ?? label
      if (f.style && f.style !== 'solid') {
        // A style has no short form: the edge becomes a mapping.
        const map = this.fields({ from, to, label: nextLabel, style: f.style })
        map.commentBefore = item.commentBefore
        map.comment = item.comment
        seq.items[i] = map
        this.touch()
        return
      }
      const next = nextLabel ? `${from} -> ${to}: ${nextLabel}` : `${from} -> ${to}`
      if (next !== text(item)) {
        item.value = next
        this.touch()
      }
      return
    }
    const map = item as YAMLMap
    this.setField(map, 'label', f.label)
    this.setField(map, 'style', f.style === 'solid' ? '' : f.style)
  }

  removeEdge(ref: EdgeRef) {
    const [seq, i] = this.edgeIndex(ref)
    seq.items.splice(i, 1)
    this.touch()
  }

  // --- groups ---

  private group(id: string): YAMLMap {
    const g = this.list('groups', false)?.items.find((it) => isMap(it) && text(it.get('id', true)) === id)
    if (!isMap(g)) throw new DiagramEditError(`no group ${id}`)
    return g
  }

  private dropMember(g: YAMLMap, node: string) {
    const nodes = g.get('nodes', true)
    if (!isSeq(nodes)) return
    const i = nodes.items.findIndex((n) => text(n) === node)
    if (i >= 0) {
      nodes.items.splice(i, 1)
      this.touch()
    }
  }

  addGroup(label: string, id?: string, nodes: string[] = []): string {
    const gid = id && !this.known.has(id) ? id : this.fresh('g')
    this.known.add(gid)
    for (const g of this.list('groups', false)?.items ?? []) {
      if (isMap(g)) for (const n of nodes) this.dropMember(g, n)
    }
    this.list('groups', true)!.items.push(this.fields({ id: gid, label, nodes }))
    this.touch()
    return gid
  }

  updateGroup(id: string, label: string) {
    this.setField(this.group(id), 'label', label)
  }

  removeGroup(id: string) {
    const seq = this.list('groups', false)!
    const i = seq.items.indexOf(this.group(id))
    seq.items.splice(i, 1)
    this.touch()
    this.removeEdgesOf(id)
    this.dropLayout(id)
  }

  setGroup(node: string, group: string | null) {
    this.nodeIndex(node)
    for (const g of this.list('groups', false)?.items ?? []) {
      if (isMap(g) && text(g.get('id', true)) !== group) this.dropMember(g, node)
    }
    if (!group) return
    const g = this.group(group)
    let nodes: unknown = g.get('nodes', true)
    if (!isSeq(nodes)) {
      nodes = this.doc.createNode([], { flow: true }) as YAMLSeq
      g.set('nodes', nodes)
    }
    const seq = nodes as YAMLSeq
    if (!seq.items.some((n) => text(n) === node)) {
      seq.items.push(this.doc.createNode(node))
      this.touch()
    }
  }

  // --- branches (tree, mind map, fishbone) ---

  private rootSlot(): Slot {
    if (!this.root.has('root')) throw new DiagramEditError('the diagram has no root')
    return {
      seg: { read: () => (this.root.get('root', true) as YamlNode) ?? null, write: (n) => this.root.set('root', n) },
      index: 0,
      single: true,
    }
  }

  private node(slot: Slot): YamlNode | null {
    const v = slot.seg.read()
    if (slot.single) return v
    return isSeq(v) ? ((v.items[slot.index] as YamlNode) ?? null) : null
  }

  private put(slot: Slot, n: YamlNode) {
    if (slot.single) slot.seg.write(n)
    else (slot.seg.read() as YAMLSeq).items[slot.index] = n
    this.touch()
  }

  /** The form of a branch: a text, {Label: children}, or {id, label, link, children}. */
  private form(n: YamlNode | null): 'leaf' | 'short' | 'full' {
    if (isScalar(n)) return 'leaf'
    if (isMap(n) && n.items.length === 1 && isPair(n.items[0]) && !BRANCH_FIELDS.includes(text(n.items[0].key))) return 'short'
    if (isMap(n)) return 'full'
    throw new DiagramEditError('a branch is a text, {label, children} or {Label: [children]}')
  }

  /** The segments a branch's children are read from, in order. */
  private segments(n: YamlNode | null, isRoot: boolean): Segment[] {
    const out: Segment[] = []
    const form = this.form(n)
    if (form === 'short') {
      const pair = (n as YAMLMap).items[0] as Pair
      out.push({ read: () => (pair.value as YamlNode) ?? null, write: (v) => (pair.value = v) })
    } else if (form === 'full') {
      const map = n as YAMLMap
      out.push({
        read: () => (map.get('children', true) as YamlNode) ?? null,
        write: (v) => (v === null ? map.delete('children') : map.set('children', v)),
      })
    }
    if (isRoot) {
      out.push({
        read: () => (this.root.get('children', true) as YamlNode) ?? null,
        write: (v) => (v === null ? this.root.delete('children') : this.root.set('children', v)),
      })
    }
    return out
  }

  private slots(seg: Segment): Slot[] {
    const v = seg.read()
    if (isSeq(v)) return v.items.map((_, index) => ({ seg, index, single: false }))
    if (isScalar(v) && v.value !== null && v.value !== undefined) return [{ seg, index: 0, single: true }]
    return []
  }

  /** The slot of the branch at path, and the segments of its parent. */
  private locate(path: BranchPath): Slot {
    let slot = this.rootSlot()
    let isRoot = true
    for (const i of path) {
      const kids = this.segments(this.node(slot), isRoot).flatMap((s) => this.slots(s))
      const next = kids[i]
      if (!next) throw new DiagramEditError(`no branch at ${path.join('.')}`)
      slot = next
      isRoot = false
    }
    return slot
  }

  /** A segment as a list, a single text made a one-item list. */
  private listOf(seg: Segment): YAMLSeq {
    const v = seg.read()
    if (isSeq(v)) return v
    const s = this.doc.createNode([], { flow: true }) as YAMLSeq
    if (isScalar(v) && v.value !== null && v.value !== undefined) s.items.push(v)
    seg.write(s)
    this.touch()
    return s
  }

  private label(n: YamlNode | null): string {
    const form = this.form(n)
    if (form === 'leaf') return text(n)
    if (form === 'short') return text(((n as YAMLMap).items[0] as Pair).key)
    return text((n as YAMLMap).get('label', true))
  }

  renameBranch(path: BranchPath, label: string) {
    const slot = this.locate(path)
    const n = this.node(slot)
    if (this.label(n) === label) return
    const form = this.form(n)
    if (form === 'leaf') (n as Scalar).value = label
    else if (form === 'short') {
      const pair = (n as YAMLMap).items[0] as Pair
      if (isScalar(pair.key)) pair.key.value = label
      else pair.key = this.doc.createNode(label)
    } else (n as YAMLMap).set('label', label)
    this.touch()
  }

  setBranchLink(path: BranchPath, link: string) {
    const slot = this.locate(path)
    const n = this.node(slot)
    const form = this.form(n)
    if (form === 'full') {
      this.setField(n as YAMLMap, 'link', link)
      return
    }
    if (!link) return
    // A link has no short form: the branch becomes {label, link, children}.
    const map = this.fields({ label: this.label(n), link })
    map.flow = false
    if (form === 'short') {
      const children = ((n as YAMLMap).items[0] as Pair).value
      if (children !== null && children !== undefined) map.set('children', children)
    }
    if (form === 'leaf') map.flow = true
    map.commentBefore = (n as YamlNode).commentBefore
    this.put(slot, map)
  }

  /** The segment a new child of the branch at slot goes to, the branch made able to have children. */
  private childSegments(slot: Slot, isRoot: boolean): Segment[] {
    let n = this.node(slot)
    if (this.form(n) === 'leaf' && !isRoot) {
      // A leaf gets its first child: {Label: [child]}.
      const map = new YAMLMap()
      map.flow = false
      map.items.push(new Pair(this.doc.createNode(text(n)), this.doc.createNode([], { flow: true })))
      map.commentBefore = (n as YamlNode).commentBefore
      this.put(slot, map)
      n = map
    }
    return this.segments(n, isRoot)
  }

  private insert(parent: BranchPath, index: number, item: YamlNode) {
    const slot = this.locate(parent)
    const segs = this.childSegments(slot, parent.length === 0)
    let rest = index
    for (let k = 0; k < segs.length; k++) {
      const count = this.slots(segs[k]!).length
      const last = k === segs.length - 1
      // A new child of the root goes to its own children, if it has some,
      // else to the top-level children.
      const empty = count === 0 && !last && segs.slice(k + 1).some((s) => this.slots(s).length > 0)
      if (!empty && (rest <= count || last)) {
        const seq = this.listOf(segs[k]!)
        seq.items.splice(Math.min(rest, seq.items.length), 0, item)
        this.touch()
        return
      }
      rest -= count
    }
    throw new DiagramEditError(`no place at ${index} under ${parent.join('.')}`)
  }

  addBranch(parent: BranchPath, index: number, label: string) {
    this.insert(parent, index, this.doc.createNode(label) as YamlNode)
  }

  /** Takes the branch at path out of its list, and tidies what it leaves. */
  private detach(path: BranchPath): YamlNode {
    if (path.length === 0) throw new DiagramEditError('the root stays')
    const slot = this.locate(path)
    const n = this.node(slot)!
    if (slot.single) slot.seg.write(null)
    else (slot.seg.read() as YAMLSeq).items.splice(slot.index, 1)
    this.touch()
    const left = slot.seg.read()
    if (left === null || (isSeq(left) && left.items.length === 0)) {
      // An empty list goes; a {Label: []} left with no children is a text again.
      const parentPath = path.slice(0, -1)
      const pslot = this.locate(parentPath)
      const p = this.node(pslot)
      if (this.form(p) === 'short' && parentPath.length > 0) {
        const leaf = this.doc.createNode(this.label(p)) as YamlNode
        leaf.commentBefore = (p as YamlNode).commentBefore
        this.put(pslot, leaf)
      } else if (isSeq(left) || left === null) {
        slot.seg.write(null)
      }
    }
    return n
  }

  removeBranch(path: BranchPath) {
    this.detach(path)
  }

  moveBranch(path: BranchPath, parent: BranchPath, index: number) {
    if (path.length === 0) throw new DiagramEditError('the root stays')
    if (parent.length >= path.length && path.every((v, i) => parent[i] === v)) {
      throw new DiagramEditError('a branch does not go under itself')
    }
    const from = path.slice(0, -1)
    const at = path[path.length - 1]!
    // Where the target is once the branch is out of its list.
    const target = [...parent]
    let idx = index
    if (target.length > from.length && from.every((v, i) => target[i] === v) && target[from.length]! > at) {
      target[from.length]!--
    }
    if (target.length === from.length && from.every((v, i) => target[i] === v) && idx > at) idx--
    if (target.join('.') === from.join('.') && idx === at) return
    // A parent left with no children turns into a text, which loses no
    // branch: the moved one goes back in below.
    const n = this.detach(path)
    this.insert(target, idx, n)
  }

  // --- shared by the forms ---

  /** The list at a top-level key for items one per line: an empty [] becomes a block list. */
  private block(key: string): YAMLSeq {
    const seq = this.list(key, true)!
    if (seq.flow && seq.items.length === 0) seq.flow = false
    return seq
  }

  private at(seq: YAMLSeq | null, index: number, what: string): YAMLMap {
    const it = seq?.items[index]
    if (!isMap(it)) throw new DiagramEditError(`no ${what} ${index}`)
    return it
  }

  /** Sets a number field (undefined leaves it); with keepZero false, 0 takes it away. */
  private setNum(map: YAMLMap, key: string, value: number | undefined, keepZero = true) {
    if (value === undefined) return
    if (!keepZero && value === 0) {
      if (map.has(key)) {
        map.delete(key)
        this.touch()
      }
      return
    }
    const cur = map.get(key, true)
    if (isScalar(cur) && Number(text(cur)) === value && text(cur) !== '') return
    if (isScalar(cur)) cur.value = value
    else map.set(key, value)
    this.touch()
  }

  /** Puts key in place of other in a mapping (same place), or sets it; '' takes both away. */
  private either(map: YAMLMap, key: string, other: string, value: string | number | undefined) {
    if (value === undefined) return
    if (value === '' || value === 0) {
      this.setField(map, key, '')
      return
    }
    const i = map.items.findIndex((p) => isPair(p) && text(p.key) === other)
    if (i >= 0) {
      map.items[i] = new Pair(this.doc.createNode(key), this.doc.createNode(value))
      this.touch()
      return
    }
    if (typeof value === 'number') this.setNum(map, key, value)
    else this.setField(map, key, value)
  }

  /** A scalar of a list replaced by a text, or set when the list is shorter. */
  private setText(seq: YAMLSeq, index: number, value: string) {
    while (seq.items.length <= index) seq.items.push(this.doc.createNode(''))
    const cur = seq.items[index]
    if (isScalar(cur)) {
      if (text(cur) === value) return
      cur.value = value
    } else seq.items[index] = this.doc.createNode(value)
    this.touch()
  }

  // --- venn ---

  private setIndex(id: string): [YAMLSeq, number] {
    const seq = this.list('sets', false)
    const i = seq ? seq.items.findIndex((it) => (isMap(it) ? text(it.get('id', true)) : text(it)) === id) : -1
    if (!seq || i < 0) throw new DiagramEditError(`no set ${id}`)
    return [seq, i]
  }

  addSet(label: string, id?: string): string {
    const sid = id && !this.known.has(id) ? id : this.fresh('s')
    this.known.add(sid)
    this.list('sets', true)!.items.push(this.fields({ id: sid, label }))
    this.touch()
    return sid
  }

  updateSet(id: string, f: { label?: string; link?: string }) {
    const [seq, i] = this.setIndex(id)
    const item: unknown = seq.items[i]
    if (isScalar(item)) {
      // A set written as its id: a mapping only when it gets more than that.
      const label = f.label !== undefined && f.label !== id ? f.label : undefined
      if (label === undefined && !f.link) return
      const map = this.fields({ id, label, link: f.link })
      map.commentBefore = item.commentBefore
      map.comment = item.comment
      seq.items[i] = map
      this.touch()
      return
    }
    const map = item as YAMLMap
    this.setField(map, 'label', f.label === id ? '' : f.label)
    this.setField(map, 'link', f.link)
  }

  removeSet(id: string) {
    const [seq, i] = this.setIndex(id)
    seq.items.splice(i, 1)
    this.touch()
    const areas = this.list('areas', false)
    if (!areas) return
    // The set leaves its areas; an area left with none goes, and so does a second one of the same sets.
    const seen = new Set<string>()
    for (let k = 0; k < areas.items.length; k++) {
      const a = areas.items[k]
      const sets = isMap(a) ? a.get('sets', true) : null
      if (!isSeq(sets)) continue
      const j = sets.items.findIndex((n) => text(n) === id)
      if (j >= 0) sets.items.splice(j, 1)
      const key = sets.items.map(text).sort().join('+')
      if (sets.items.length === 0 || seen.has(key)) {
        areas.items.splice(k--, 1)
        continue
      }
      seen.add(key)
    }
  }

  addArea(sets: string[], label = '') {
    this.block('areas').items.push(this.fields({ sets, label }))
    this.touch()
  }

  updateArea(index: number, f: { sets?: string[]; label?: string; size?: number }) {
    const map = this.at(this.list('areas', false), index, 'area')
    if (f.sets) {
      const cur = map.get('sets', true)
      const now = isSeq(cur) ? cur.items.map(text) : []
      if (now.join('\u0000') !== f.sets.join('\u0000')) {
        map.set('sets', this.doc.createNode(f.sets, { flow: true }))
        this.touch()
      }
    }
    this.setField(map, 'label', f.label)
    this.setNum(map, 'size', f.size, false)
  }

  removeArea(index: number) {
    const seq = this.list('areas', false)
    this.at(seq, index, 'area')
    seq!.items.splice(index, 1)
    this.touch()
  }

  // --- matrix ---

  setAxis(axis: 'x' | 'y', f: { label?: string; low?: string; high?: string }) {
    const cur: unknown = this.root.get(axis, true)
    if (isMap(cur)) {
      this.setField(cur, 'label', f.label)
      this.setField(cur, 'low', f.low)
      this.setField(cur, 'high', f.high)
      return
    }
    const label = f.label ?? (isScalar(cur) ? text(cur) : '')
    if (isScalar(cur) && !f.low && !f.high) {
      // x: Urgency stays a text while it has no low or high.
      if (text(cur) !== label) {
        cur.value = label
        this.touch()
      }
      return
    }
    if (!label && !f.low && !f.high && cur === undefined) return
    this.root.set(axis, this.fields({ label, low: f.low, high: f.high }))
    this.touch()
  }

  setQuadrant(index: number, label: string) {
    if (index < 0 || index > 3) throw new DiagramEditError(`no quadrant ${index}`)
    let seq: unknown = this.root.get('quadrants', true)
    if (!isSeq(seq)) {
      seq = this.doc.createNode(['', '', '', ''], { flow: true })
      this.root.set('quadrants', seq)
      this.touch()
    }
    this.setText(seq as YAMLSeq, index, label)
  }

  private round(v: number) {
    return Math.round(Math.min(1, Math.max(0, v)) * 100) / 100
  }

  addItem(label: string, x: number, y: number) {
    this.block('items').items.push(this.fields({ label, x: this.round(x), y: this.round(y) }))
    this.touch()
  }

  updateItem(index: number, f: { label?: string; x?: number; y?: number; link?: string }) {
    const map = this.at(this.list('items', false), index, 'item')
    this.setField(map, 'label', f.label)
    this.setNum(map, 'x', f.x === undefined ? undefined : this.round(f.x))
    this.setNum(map, 'y', f.y === undefined ? undefined : this.round(f.y))
    this.setField(map, 'link', f.link)
  }

  removeItem(index: number) {
    const seq = this.list('items', false)
    this.at(seq, index, 'item')
    seq!.items.splice(index, 1)
    this.touch()
  }

  private texts(key: string): YAMLSeq {
    const seq = this.root.get(key, true)
    if (!isSeq(seq)) throw new DiagramEditError(`the grid has no ${key}`)
    return seq
  }

  setCell(row: number, column: number, value: string) {
    if (row < 0 || row >= this.texts('rows').items.length || column < 0 || column >= this.texts('columns').items.length) {
      throw new DiagramEditError(`no cell ${row}, ${column}`)
    }
    const cells = this.list('cells', true)!
    if (cells.flow && cells.items.length === 0) cells.flow = false
    while (cells.items.length <= row) cells.items.push(this.doc.createNode([], { flow: true }))
    let r: unknown = cells.items[row]
    if (!isSeq(r)) {
      r = this.doc.createNode([], { flow: true })
      cells.items[row] = r as YAMLSeq
    }
    const seq = r as YAMLSeq
    if (value === '' && column >= seq.items.length) return
    this.setText(seq, column, value)
  }

  renameRow(index: number, label: string) {
    const seq = this.texts('rows')
    if (index < 0 || index >= seq.items.length) throw new DiagramEditError(`no row ${index}`)
    this.setText(seq, index, label)
  }

  renameColumn(index: number, label: string) {
    const seq = this.texts('columns')
    if (index < 0 || index >= seq.items.length) throw new DiagramEditError(`no column ${index}`)
    this.setText(seq, index, label)
  }

  addRow(index: number, label: string) {
    const rows = this.texts('rows')
    rows.items.splice(index, 0, this.doc.createNode(label))
    const cells = this.list('cells', false)
    if (cells && cells.items.length > index) cells.items.splice(index, 0, this.doc.createNode([], { flow: true }))
    this.touch()
  }

  removeRow(index: number) {
    const rows = this.texts('rows')
    if (index < 0 || index >= rows.items.length) throw new DiagramEditError(`no row ${index}`)
    rows.items.splice(index, 1)
    const cells = this.list('cells', false)
    if (cells && cells.items.length > index) cells.items.splice(index, 1)
    this.touch()
  }

  addColumn(index: number, label: string) {
    this.texts('columns').items.splice(index, 0, this.doc.createNode(label))
    for (const r of this.list('cells', false)?.items ?? []) {
      if (isSeq(r) && r.items.length > index) r.items.splice(index, 0, this.doc.createNode(''))
    }
    this.touch()
  }

  removeColumn(index: number) {
    const cols = this.texts('columns')
    if (index < 0 || index >= cols.items.length) throw new DiagramEditError(`no column ${index}`)
    cols.items.splice(index, 1)
    for (const r of this.list('cells', false)?.items ?? []) {
      if (isSeq(r) && r.items.length > index) r.items.splice(index, 1)
    }
    this.touch()
  }

  // --- gantt ---

  private tasksOf(section: number): YAMLSeq {
    const top = this.root.get('tasks', true)
    if (isSeq(top)) {
      if (section !== 0) throw new DiagramEditError(`no section ${section}`)
      return top
    }
    const s = this.at(this.list('sections', false), section, 'section')
    let t: unknown = s.get('tasks', true)
    if (!isSeq(t)) {
      t = new YAMLSeq()
      s.set('tasks', t)
      this.touch()
    }
    return t as YAMLSeq
  }

  private task(ref: TaskRef): YAMLMap {
    return this.at(this.tasksOf(ref.section), ref.index, 'task')
  }

  /** Every task of the Gantt, by its mapping. */
  private allTasks(): YAMLMap[] {
    const top = this.root.get('tasks', true)
    if (isSeq(top)) return top.items.filter(isMap)
    return (this.list('sections', false)?.items ?? []).flatMap((s) => {
      const t = isMap(s) ? s.get('tasks', true) : null
      return isSeq(t) ? t.items.filter(isMap) : []
    })
  }

  addTask(section: number, index: number, f: TaskFields & { label: string; id?: string }): string {
    const tid = f.id && !this.known.has(f.id) ? f.id : this.fresh('t')
    this.known.add(tid)
    let seq: YAMLSeq
    if (!this.root.has('tasks') && !this.root.has('sections')) seq = this.block('tasks')
    else seq = this.tasksOf(section)
    if (seq.flow && seq.items.length === 0) seq.flow = false
    const map = this.fields({ id: tid, label: f.label, start: f.start, after: f.after, end: f.end, days: f.days || undefined, status: f.status, link: f.link })
    seq.items.splice(Math.min(index, seq.items.length), 0, map)
    this.touch()
    return tid
  }

  updateTask(ref: TaskRef, f: TaskFields) {
    const map = this.task(ref)
    if (f.id && !map.has('id')) {
      if (this.known.has(f.id)) throw new DiagramEditError(`the id ${f.id} is taken`)
      this.known.add(f.id)
      map.items.unshift(new Pair(this.doc.createNode('id'), this.doc.createNode(f.id)))
      this.touch()
    }
    this.setField(map, 'label', f.label)
    this.either(map, 'start', 'after', f.start)
    this.either(map, 'after', 'start', f.after)
    this.either(map, 'end', 'days', f.end)
    this.either(map, 'days', 'end', f.days)
    this.setField(map, 'status', f.status)
    this.setField(map, 'link', f.link)
  }

  /** The tasks that came after removed ones come after what those came after, or start when they started. */
  private reattach(removed: Map<string, { start: string; after: string }>) {
    for (const t of this.allTasks()) {
      let cur = text(t.get('after', true))
      if (!removed.has(cur)) continue
      while (removed.has(cur) && removed.get(cur)!.after) cur = removed.get(cur)!.after
      const gone = removed.get(cur)
      if (!gone) this.setField(t, 'after', cur)
      else if (gone.start) this.either(t, 'start', 'after', gone.start)
      else this.setField(t, 'after', '')
    }
  }

  private gone(map: YAMLMap, into: Map<string, { start: string; after: string }>) {
    const id = text(map.get('id', true))
    if (id) into.set(id, { start: text(map.get('start', true)), after: text(map.get('after', true)) })
  }

  removeTask(ref: TaskRef) {
    const seq = this.tasksOf(ref.section)
    const map = this.at(seq, ref.index, 'task')
    seq.items.splice(ref.index, 1)
    this.touch()
    const removed = new Map<string, { start: string; after: string }>()
    this.gone(map, removed)
    this.reattach(removed)
  }

  moveTask(ref: TaskRef, section: number, index: number) {
    const from = this.tasksOf(ref.section)
    const map = this.at(from, ref.index, 'task')
    const to = this.tasksOf(section)
    let at = index
    if (from === to && at > ref.index) at--
    if (from === to && at === ref.index) return
    from.items.splice(ref.index, 1)
    if (to.flow && to.items.length === 0) to.flow = false
    to.items.splice(Math.min(at, to.items.length), 0, map)
    this.touch()
  }

  addSection(index: number, label: string) {
    const i = this.root.items.findIndex((p) => isPair(p) && text(p.key) === 'tasks')
    if (i >= 0) {
      // Tasks without sections become the first section, without a label.
      const first = new YAMLMap()
      first.set('tasks', (this.root.items[i] as Pair).value)
      const seq = new YAMLSeq()
      seq.items.push(first)
      this.root.items[i] = new Pair(this.doc.createNode('sections'), seq)
    }
    const seq = this.list('sections', true)!
    const s = new YAMLMap()
    s.set('label', label)
    s.set('tasks', this.doc.createNode([], { flow: true }))
    seq.items.splice(Math.min(index, seq.items.length), 0, s)
    this.touch()
  }

  renameSection(index: number, label: string) {
    this.setField(this.at(this.list('sections', false), index, 'section'), 'label', label)
  }

  removeSection(index: number) {
    const seq = this.list('sections', false)
    const s = this.at(seq, index, 'section')
    if (seq!.items.length === 1) throw new DiagramEditError('a Gantt keeps one section at least')
    seq!.items.splice(index, 1)
    this.touch()
    const removed = new Map<string, { start: string; after: string }>()
    const tasks = s.get('tasks', true)
    for (const t of isSeq(tasks) ? tasks.items : []) if (isMap(t)) this.gone(t, removed)
    this.reattach(removed)
  }
}

function knownIds(d: Diagram): Set<string> {
  const ids = new Set<string>()
  d.nodes.forEach((n) => ids.add(n.id))
  d.groups.forEach((g) => ids.add(g.id))
  d.sets.forEach((s) => ids.add(s.id))
  d.sections.forEach((s) => s.tasks.forEach((t) => t.id && ids.add(t.id)))
  const walk = (b: DiagramBranch | undefined) => {
    if (!b) return
    if (b.id) ids.add(b.id)
    b.children.forEach(walk)
  }
  walk(d.root)
  return ids
}

/**
 * Applies operations to a diagram's YAML and gives the new text. What the
 * operations do not touch stays as written; without a change the text is
 * the one given. Throws DiagramEditError when the YAML does not read or an
 * operation names what is not there; then nothing is applied.
 */
export function editDiagram(source: string, ops: DiagramOp | DiagramOp[]): EditResult {
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
        e.ids.push(e.addNode(o.label, o.id, o.shape, o.at))
        break
      case 'updateNode':
        e.updateNode(o.id, o)
        break
      case 'removeNode':
        e.removeNode(o.id)
        break
      case 'addEdge':
        e.addEdge(o.from, o.to, o.label)
        break
      case 'updateEdge':
        e.updateEdge(o.edge, o)
        break
      case 'removeEdge':
        e.removeEdge(o.edge)
        break
      case 'addGroup':
        e.ids.push(e.addGroup(o.label, o.id, o.nodes))
        break
      case 'updateGroup':
        e.updateGroup(o.id, o.label)
        break
      case 'removeGroup':
        e.removeGroup(o.id)
        break
      case 'setGroup':
        e.setGroup(o.node, o.group)
        break
      case 'renameBranch':
        e.renameBranch(o.path, o.label)
        break
      case 'setBranchLink':
        e.setBranchLink(o.path, o.link)
        break
      case 'addBranch':
        e.addBranch(o.parent, o.index, o.label)
        break
      case 'removeBranch':
        e.removeBranch(o.path)
        break
      case 'moveBranch':
        e.moveBranch(o.path, o.parent, o.index)
        break
      case 'addSet':
        e.ids.push(e.addSet(o.label, o.id))
        break
      case 'updateSet':
        e.updateSet(o.id, o)
        break
      case 'removeSet':
        e.removeSet(o.id)
        break
      case 'addArea':
        e.addArea(o.sets, o.label)
        break
      case 'updateArea':
        e.updateArea(o.index, o)
        break
      case 'removeArea':
        e.removeArea(o.index)
        break
      case 'setAxis':
        e.setAxis(o.axis, o)
        break
      case 'setQuadrant':
        e.setQuadrant(o.index, o.label)
        break
      case 'addItem':
        e.addItem(o.label, o.x, o.y)
        break
      case 'updateItem':
        e.updateItem(o.index, o)
        break
      case 'removeItem':
        e.removeItem(o.index)
        break
      case 'setCell':
        e.setCell(o.row, o.column, o.text)
        break
      case 'renameRow':
        e.renameRow(o.index, o.label)
        break
      case 'renameColumn':
        e.renameColumn(o.index, o.label)
        break
      case 'addRow':
        e.addRow(o.index, o.label)
        break
      case 'removeRow':
        e.removeRow(o.index)
        break
      case 'addColumn':
        e.addColumn(o.index, o.label)
        break
      case 'removeColumn':
        e.removeColumn(o.index)
        break
      case 'addTask':
        e.ids.push(e.addTask(o.section, o.index, o))
        break
      case 'updateTask':
        e.updateTask(o.task, o)
        break
      case 'removeTask':
        e.removeTask(o.task)
        break
      case 'moveTask':
        e.moveTask(o.task, o.section, o.index)
        break
      case 'addSection':
        e.addSection(o.index, o.label)
        break
      case 'renameSection':
        e.renameSection(o.index, o.label)
        break
      case 'removeSection':
        e.removeSection(o.index)
        break
    }
  }
  if (!e.changed) return { source, changed: false, ids: e.ids }
  const out = e.toString()
  return { source: out, changed: out !== source, ids: e.ids }
}
