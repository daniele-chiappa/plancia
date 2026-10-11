import { Document, isMap, isScalar, isSeq, visit, Scalar, YAMLMap, YAMLSeq, type Node as YamlNode } from 'yaml'
import { edgeRe } from '../model/parse'

// The YAML a conversion writes: the fields in the order of the docs, each
// node, edge, set or task on a line of its own as a flow mapping, an edge
// in its short form when it has one, a branch as a text or {Label: [children]}
// when it has nothing else. What an agent would write, so it reads at once.

export const STRINGIFY = { lineWidth: 0, flowCollectionPadding: false } as const

/** A value left out of the YAML: empty text, no number, an empty list. */
const empty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)

/** The fields of o that are not empty, in their order. */
export function compact(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => !empty(v)))
}

export interface OutBranch {
  label: string
  id?: string
  link?: string
  children: OutBranch[]
}

export class YamlOut {
  private doc = new Document({})
  private top = this.doc.contents as YAMLMap

  /** A scalar field, left out when empty. */
  set(key: string, value: unknown) {
    if (!empty(value)) this.top.set(key, value)
  }

  /** A list whose items are flow mappings (or texts), one per line. */
  list(key: string, items: unknown[]) {
    if (items.length === 0) return
    const seq = new YAMLSeq()
    for (const it of items) {
      const n = this.doc.createNode(typeof it === 'object' && it !== null && !Array.isArray(it) ? compact(it as Record<string, unknown>) : it)
      if (isMap(n) || isSeq(n)) n.flow = true
      seq.items.push(n)
    }
    this.top.set(key, seq)
  }

  /** The nodes of a flow: on one line when each is its id alone, else one per line. */
  nodes(items: (string | Record<string, unknown>)[]) {
    if (items.length && items.every((n) => typeof n === 'string')) this.flowList('nodes', items)
    else this.list('nodes', items)
  }

  /** A mapping on one line: x: {label, low, high}. */
  flowMap(key: string, value: Record<string, unknown>) {
    const n = this.doc.createNode(compact(value)) as YAMLMap
    n.flow = true
    this.top.set(key, n)
  }

  /** A list on one line: rows: [a, b]. */
  flowList(key: string, value: unknown[]) {
    const n = this.doc.createNode(value) as YAMLSeq
    n.flow = true
    this.top.set(key, n)
  }

  /** A list of lists, each on a line: cells. */
  rows(key: string, value: string[][]) {
    const seq = new YAMLSeq()
    for (const row of value) {
      const n = this.doc.createNode(row) as YAMLSeq
      n.flow = true
      seq.items.push(n)
    }
    this.top.set(key, seq)
  }

  /** An edge: "from -> to: label" when that reads back the same, else a mapping. */
  static edge(from: string, to: string, label = '', style = 'solid'): unknown {
    const short = label ? `${from} -> ${to}: ${label}` : `${from} -> ${to}`
    const m = edgeRe.exec(short)
    if (style === 'solid' && !/\n/.test(label) && m && m[1] === from && m[2] === to && (m[3] ?? '').trim() === label.trim() && label === label.trim()) {
      return short
    }
    return { from, to, label, style: style === 'solid' ? '' : style }
  }

  /** root and children of a tree, its branches in their short forms where they can be. */
  tree(root: OutBranch) {
    if (root.id || root.link) this.flowMap('root', { id: root.id, label: root.label, link: root.link })
    else this.top.set('root', root.label)
    if (root.children.length) this.top.set('children', this.branches(root.children))
  }

  private branches(list: OutBranch[]): YAMLSeq {
    const seq = new YAMLSeq()
    // A list of leaves goes on one line.
    if (list.every((b) => !b.children.length && !b.id && !b.link)) seq.flow = true
    for (const b of list) seq.items.push(this.branch(b))
    return seq
  }

  private branch(b: OutBranch): YamlNode {
    if (b.id || b.link) {
      const n = this.doc.createNode(compact({ id: b.id, label: b.label, link: b.link })) as YAMLMap
      if (b.children.length) n.set('children', this.branches(b.children))
      else n.flow = true
      return n
    }
    if (!b.children.length) return this.doc.createNode(b.label) as YamlNode
    const n = new YAMLMap()
    n.set(this.doc.createNode(b.label), this.branches(b.children))
    return n
  }

  /** The sections of a Gantt, their tasks one per line. */
  sections(list: { label: string; tasks: Record<string, unknown>[] }[]) {
    const seq = new YAMLSeq()
    for (const s of list) {
      const m = new YAMLMap()
      if (s.label) m.set('label', s.label)
      const tasks = new YAMLSeq()
      for (const t of s.tasks) {
        const n = this.doc.createNode(compact(t)) as YAMLMap
        n.flow = true
        tasks.items.push(n)
      }
      m.set('tasks', tasks)
      seq.items.push(m)
    }
    this.top.set('sections', seq)
  }

  /** layout: id: {x, y, w, h}. */
  layout(positions: Record<string, { x: number; y: number; w?: number; h?: number }>) {
    const ids = Object.keys(positions)
    if (!ids.length) return
    const m = new YAMLMap()
    for (const id of ids) {
      const p = positions[id]!
      const n = this.doc.createNode(compact({ x: Math.round(p.x), y: Math.round(p.y), w: p.w ? Math.round(p.w) : undefined, h: p.h ? Math.round(p.h) : undefined })) as YAMLMap
      n.flow = true
      m.set(id, n)
    }
    this.top.set('layout', m)
  }

  toString(): string {
    // A text of several lines in a flow mapping is written quoted, \n and all.
    visit(this.doc, {
      Scalar(_, n) {
        if (isScalar(n) && typeof n.value === 'string' && n.value.includes('\n')) n.type = Scalar.QUOTE_DOUBLE
      },
    })
    return this.doc.toString(STRINGIFY)
  }
}
