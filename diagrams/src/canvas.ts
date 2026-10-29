import type { Diagram, NodeClass } from './model/types'
import { flowGraph } from './layout/graph'
import { layoutGraph } from './layout/layout'
import { createMeasure, type Measure } from './layout/shapes'
import { linkTarget } from './links'
import { YamlOut } from './convert/yaml'
import { DiagramConvertError, type ConvertResult } from './mermaid/import'

// A flow and an Obsidian canvas (JSON Canvas 1.0), both ways. A node is a
// text card where the drawing puts it, a group a group card around its
// nodes, an edge a connection between the sides that face each other.
// Back, the cards are nodes at their places (layout:), a card inside a
// group is in it, and what a flow has no place for is said in a warning.

interface CanvasNode {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  color?: string
  text?: string
  file?: string
  subpath?: string
  url?: string
  label?: string
}

interface CanvasEdge {
  id: string
  fromNode: string
  toNode: string
  fromSide?: string
  toSide?: string
  fromEnd?: string
  toEnd?: string
  color?: string
  label?: string
}

// The preset colours of a canvas for the classes of the format: green for
// data, cyan for a person, purple for an outside system.
const COLORS: Partial<Record<NodeClass, string>> = { data: '4', user: '5', ext: '6' }

type Side = 'top' | 'right' | 'bottom' | 'left'
interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** The sides of a and b that face each other. */
function sides(a: Box, b: Box): [Side, Side] {
  const dx = b.x + b.w / 2 - (a.x + a.w / 2)
  const dy = b.y + b.h / 2 - (a.y + a.h / 2)
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? ['right', 'left'] : ['left', 'right']
  return dy > 0 ? ['bottom', 'top'] : ['top', 'bottom']
}

/** A node's text on its card: its label, as a link to what it links. */
function cardText(label: string, link: string): string {
  const l = linkTarget(link, label)
  if (!l) return label
  if (l.kind === 'url') return `[${label.replace(/[\\[\]]/g, '\\$&')}](${l.target})`
  return l.target === label ? `[[${l.target}]]` : `[[${l.target}|${label.replace(/[|\]]/g, ' ')}]]`
}

/**
 * A flow as the JSON of an Obsidian canvas: its nodes where the drawing
 * puts them (at their places in layout:, the others laid out as the view
 * lays them), its groups around their nodes, its edges between facing sides.
 */
export function toCanvas(d: Diagram, measure: Measure = createMeasure()): string {
  if (d.kind !== 'flow') throw new DiagramConvertError(`a ${d.kind} has no canvas: a flow does`)
  const laid = layoutGraph(flowGraph(d), measure, d.layout ?? {})
  const nodes: CanvasNode[] = []
  const boxes = new Map<string, Box>()
  const r = Math.round
  for (const g of laid.groups) {
    boxes.set(g.id, g)
    nodes.push({ id: g.id, type: 'group', x: r(g.x), y: r(g.y), width: r(g.w), height: r(g.h), label: g.label })
  }
  for (const n of laid.nodes) {
    boxes.set(n.id, n)
    const color = n.cls ? COLORS[n.cls as NodeClass] : undefined
    nodes.push({
      id: n.id,
      type: 'text',
      text: cardText(n.label, n.link),
      x: r(n.x),
      y: r(n.y),
      width: r(n.w),
      height: r(n.h),
      ...(color ? { color } : {}),
    })
  }
  const edges: CanvasEdge[] = []
  d.edges.forEach((e, i) => {
    const a = boxes.get(e.from)
    const b = boxes.get(e.to)
    if (!a || !b) return
    const [fromSide, toSide] = sides(a, b)
    edges.push({ id: `e${i + 1}`, fromNode: e.from, fromSide, toNode: e.to, toSide, ...(e.label ? { label: e.label } : {}) })
  })
  return JSON.stringify({ nodes, edges }, null, '\t') + '\n'
}

const idRe = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/

/** The label of a text card: its markdown as plain text, a link alone as its text. */
function labelOf(text: string): { label: string; link: string } {
  const t = text.trim()
  const wiki = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/.exec(t)
  if (wiki) return { label: (wiki[2] ?? wiki[1]!.split('/').pop()!).trim(), link: `[[${wiki[1]!.trim()}]]` }
  const md = /^\[((?:\\.|[^\\\]])+)\]\((https?:\/\/[^)\s]+)\)$/.exec(t)
  // Markdown's escapes: a backslash before ASCII punctuation, as cardText writes them.
  if (md) return { label: md[1]!.replace(/\\([!-/:-@[-`{-~])/g, '$1'), link: md[2]! }
  const label = t
    .split('\n')
    .map((l) => l.replace(/^\s{0,3}(#{1,6}\s+|[-*+]\s+|>\s?)/, ''))
    .join('\n')
    .replace(/\*\*|__|`/g, '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, (_, target: string) => target.split('#')[0]!.split('/').pop()!)
    .replace(/\n{2,}/g, '\n')
    .trim()
  return { label, link: '' }
}

const MAX_LABEL = 300

/**
 * The JSON of an Obsidian canvas as a flow: a text, file or link card is a
 * node at its place, a group card a group of the nodes inside it, a
 * connection an edge. Throws DiagramConvertError when the JSON does not read.
 */
export function fromCanvas(json: string, opts: { title?: string } = {}): ConvertResult {
  let data: { nodes?: CanvasNode[]; edges?: CanvasEdge[] }
  try {
    data = JSON.parse(json) as typeof data
  } catch (e) {
    throw new DiagramConvertError(`the canvas does not read: ${e instanceof Error ? e.message : String(e)}`)
  }
  const cards = Array.isArray(data.nodes) ? data.nodes.filter((n) => n && typeof n.id === 'string') : []
  if (!cards.some((c) => c.type !== 'group')) throw new DiagramConvertError('the canvas has no cards')
  const warnings = new Set<string>()
  const taken = new Set<string>()
  const ids = new Map<string, string>()
  const idOf = (c: CanvasNode, prefix: string) => {
    let out = idRe.test(c.id) && !taken.has(c.id) ? c.id : ''
    let i = 1
    while (!out || taken.has(out)) out = `${prefix}${i++}`
    taken.add(out)
    ids.set(c.id, out)
    return out
  }
  const box = (c: CanvasNode): Box => ({ x: Number(c.x) || 0, y: Number(c.y) || 0, w: Number(c.width) || 0, h: Number(c.height) || 0 })
  const inside = (a: Box, g: Box) => a.x >= g.x && a.y >= g.y && a.x + a.w <= g.x + g.w && a.y + a.h <= g.y + g.h
  const groupCards = cards.filter((c) => c.type === 'group')
  const nodeCards = cards.filter((c) => c.type !== 'group')
  const layout: Record<string, Box> = {}
  const nodes = nodeCards.map((c) => {
    const id = idOf(c, 'n')
    let label = ''
    let link = ''
    let shape = ''
    if (c.type === 'file') {
      const file = String(c.file ?? '')
      const name = file.split('/').pop()!.replace(/\.md$/i, '')
      label = name
      link = /\.md$/i.test(file) || !/\.[a-z0-9]+$/i.test(file) ? `[[${file.replace(/\.md$/i, '')}${c.subpath ?? ''}]]` : ''
      shape = 'doc'
    } else if (c.type === 'link') {
      label = String(c.url ?? '').replace(/^https?:\/\//, '')
      link = /^https?:\/\//.test(String(c.url ?? '')) ? String(c.url) : ''
    } else {
      if (c.type !== 'text') warnings.add(`a ${c.type} card is a node with its text`)
      ;({ label, link } = labelOf(String(c.text ?? '')))
    }
    if (label.length > MAX_LABEL) {
      label = `${label.slice(0, MAX_LABEL)}…`
      warnings.add(`a long card keeps its first ${MAX_LABEL} characters`)
    }
    const cls = (Object.entries(COLORS) as [NodeClass, string][]).find(([, v]) => v === c.color)?.[0] ?? ''
    if (c.color && !cls) warnings.add('colours other than green, cyan and purple are not kept')
    const b = box(c)
    layout[id] = b
    return { id, label: label === id ? '' : label, shape, link, class: cls }
  })
  // A card is in the smallest group around it; a group in a group is a group of its own.
  const groupBoxes = groupCards.map((g) => ({ card: g, box: box(g), id: idOf(g, 'g') }))
  const members = new Map<string, string[]>(groupBoxes.map((g) => [g.id, []]))
  nodeCards.forEach((c, i) => {
    const b = box(c)
    const around = groupBoxes.filter((g) => inside(b, g.box)).sort((x, y) => x.box.w * x.box.h - y.box.w * y.box.h)[0]
    if (around) members.get(around.id)!.push(nodes[i]!.id)
  })
  if (groupBoxes.some((g) => groupBoxes.some((o) => o !== g && inside(g.box, o.box)))) {
    warnings.add('a group inside another is a group of its own')
  }
  const groups = groupBoxes.map((g) => ({ id: g.id, label: String(g.card.label ?? ''), nodes: members.get(g.id)! }))
  // A group's box is drawn around its nodes; an empty one keeps its place.
  for (const g of groupBoxes) if (!members.get(g.id)!.length) layout[g.id] = g.box
  const edges = (Array.isArray(data.edges) ? data.edges : []).flatMap((e) => {
    const from = ids.get(e.fromNode)
    const to = ids.get(e.toNode)
    if (!from || !to) {
      warnings.add('a connection to a card that is not there is left out')
      return []
    }
    if (e.toEnd === 'none' || e.fromEnd === 'arrow') warnings.add('every connection is an arrow from its first card to its second')
    return [YamlOut.edge(from, to, String(e.label ?? '').replace(/\s+/g, ' ').trim())]
  })
  const out = new YamlOut()
  out.set('kind', 'flow')
  out.set('title', opts.title ?? '')
  out.nodes(nodes.map((n) => (n.label || n.shape || n.class || n.link ? n : n.id)))
  out.list('edges', edges)
  out.list('groups', groups)
  out.layout(layout)
  return { source: out.toString(), warnings: [...warnings] }
}
