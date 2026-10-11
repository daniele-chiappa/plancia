import { Graph as DagreGraph, layout as dagreLayout } from '@dagrejs/dagre'
import type { LayoutPoint, NodeShape } from '../model/types'
import type { Graph, GraphEdge, GraphGroup, GraphNode } from './graph'
import { LINE_HEIGHT, nodeSize, wrapLabel, type Measure } from './shapes'

export interface Point {
  x: number
  y: number
}

/** A box: its top left corner and its size, in px. */
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface LaidNode extends GraphNode, Box {
  lines: string[]
}

export interface LaidGroup extends GraphGroup, Box {}

export interface LaidEdge extends GraphEdge {
  /** From the border of one box to the border of the other. */
  points: Point[]
  /** The centre of the label, when there is one. */
  labelAt: Point | null
  labelLines: string[]
  /** The size of the label's box, 0 × 0 without a label. */
  labelW: number
  labelH: number
  /** How far the edge bends aside, in px: two edges between the same nodes must not lie on each other. */
  bend: number
}

export interface Laid {
  nodes: LaidNode[]
  edges: LaidEdge[]
  groups: LaidGroup[]
  width: number
  height: number
}

const MARGIN = 16
const GROUP_PAD = 16
const GROUP_LABEL = 22
const LABEL_PAD = 6

/**
 * Lays out a graph with dagre (the direction is its rankdir), then puts
 * the ids that `layout:` places where it says: x and y are the top left
 * corner, w and h the size when given. The whole drawing is moved to start
 * at a small margin from 0,0.
 */
export function layoutGraph(g: Graph, measure: Measure, fixed: Record<string, LayoutPoint> = {}): Laid {
  const nodes: LaidNode[] = g.nodes.map((n) => {
    const box = nodeSize(n.shape, wrapLabel(n.label, measure), measure)
    const at = fixed[n.id]
    return {
      ...n,
      lines: box.lines,
      x: 0,
      y: 0,
      w: at && at.w > 0 ? at.w : box.w,
      h: at && at.h > 0 ? at.h : box.h,
    }
  })
  const byId = new Map(nodes.map((n) => [n.id, n]))
  // A group without nodes is drawn as a box of its own.
  const groupMembers = new Map(g.groups.map((gr) => [gr.id, gr.nodes.filter((m) => byId.has(m))]))

  const dg = new DagreGraph({ compound: true, multigraph: true })
  dg.setGraph({ rankdir: g.direction, nodesep: 36, ranksep: 52, edgesep: 14, marginx: 0, marginy: 0 })
  dg.setDefaultEdgeLabel(() => ({}))
  for (const n of nodes) dg.setNode(n.id, { width: n.w, height: n.h })
  const lonely = new Map<string, LaidNode>()
  for (const gr of g.groups) {
    const members = groupMembers.get(gr.id)!
    if (members.length === 0) {
      const box = nodeSize('box', wrapLabel(gr.label || gr.id, measure), measure)
      const ln: LaidNode = { id: gr.id, label: gr.label, shape: 'box', cls: '', link: '', group: '', depth: 0, lines: box.lines, x: 0, y: 0, w: box.w, h: box.h }
      lonely.set(gr.id, ln)
      dg.setNode(gr.id, { width: box.w, height: box.h })
      continue
    }
    dg.setNode(gr.id, {})
    for (const m of members) dg.setParent(m, gr.id)
  }
  // dagre takes no edge to a cluster: such an edge is laid out from or to a
  // node of the group, then drawn to the group's box.
  const endpoint = (id: string) => (byId.has(id) || lonely.has(id) ? id : groupMembers.get(id)?.[0])
  const labels = new Map<string, { lines: string[]; w: number; h: number }>()
  for (const e of g.edges) {
    const v = endpoint(e.from)
    const w = endpoint(e.to)
    if (!v || !w) continue
    const lines = e.label === '' ? [] : wrapLabel(e.label, measure)
    const size = lines.length > 0 ? { w: Math.ceil(Math.max(...lines.map(measure)) + 2 * LABEL_PAD), h: lines.length * LINE_HEIGHT + 4 } : { w: 0, h: 0 }
    labels.set(e.id, { lines, ...size })
    dg.setEdge({ v, w, name: e.id }, lines.length > 0 ? { width: size.w, height: size.h, labelpos: 'c' } : {})
  }
  // A tree keeps its branches in the order written: dagre's ordering, which
  // only cares for crossings, would swap them.
  const constraints: { left: string; right: string }[] = []
  if (g.ordered) {
    const kids = new Map<string, string[]>()
    for (const e of g.edges) kids.set(e.from, [...(kids.get(e.from) ?? []), e.to])
    for (const list of kids.values()) {
      for (let i = 1; i < list.length; i++) constraints.push({ left: list[i - 1]!, right: list[i]! })
    }
  }
  dagreLayout(dg, g.ordered ? { disableOptimalOrderHeuristic: true, constraints } : undefined)

  const moved = new Set<string>()
  for (const n of [...nodes, ...lonely.values()]) {
    const at = dg.node(n.id) as { x: number; y: number } | undefined
    if (at) {
      n.x = at.x - n.w / 2
      n.y = at.y - n.h / 2
    }
    const fx = fixed[n.id]
    if (fx) {
      n.x = fx.x
      n.y = fx.y
      moved.add(n.id)
    }
  }

  const groups: LaidGroup[] = g.groups.map((gr) => {
    const members = groupMembers.get(gr.id)!
    const fx = fixed[gr.id]
    const solo = lonely.get(gr.id)
    let box: Box
    if (solo) {
      box = { x: solo.x, y: solo.y, w: solo.w, h: solo.h }
    } else {
      const ms = members.map((m) => byId.get(m)!)
      const x0 = Math.min(...ms.map((m) => m.x)) - GROUP_PAD
      const y0 = Math.min(...ms.map((m) => m.y)) - GROUP_PAD - GROUP_LABEL
      const x1 = Math.max(...ms.map((m) => m.x + m.w)) + GROUP_PAD
      const y1 = Math.max(...ms.map((m) => m.y + m.h)) + GROUP_PAD
      box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
    }
    if (fx) {
      moved.add(gr.id)
      box = { x: fx.x, y: fx.y, w: fx.w > 0 ? fx.w : box.w, h: fx.h > 0 ? fx.h : box.h }
    }
    return { ...gr, ...box }
  })
  const boxOf = (id: string): Box | undefined => byId.get(id) ?? groups.find((gr) => gr.id === id)
  const shapeOf = (id: string): NodeShape => byId.get(id)?.shape ?? 'box'

  const edges: LaidEdge[] = []
  for (const e of g.edges) {
    const a = boxOf(e.from)
    const b = boxOf(e.to)
    const label = labels.get(e.id)
    if (!a || !b || !label) continue
    const lines = label.lines
    const de = dg.edge({ v: endpoint(e.from)!, w: endpoint(e.to)!, name: e.id }) as
      | { points?: Point[]; x?: number; y?: number }
      | undefined
    const own = byId.has(e.from) && byId.has(e.to) && !moved.has(e.from) && !moved.has(e.to)
    let points: Point[]
    let labelAt: Point | null = null
    if (own && de?.points?.length) {
      points = de.points.map((p) => ({ x: p.x, y: p.y }))
      // dagre ends an edge on the box; a rhombus or a circle is inside it.
      if (points.length >= 2) {
        points[0] = border(a, points[1]!, shapeOf(e.from))
        points[points.length - 1] = border(b, points[points.length - 2]!, shapeOf(e.to))
      }
      if (lines.length > 0 && de.x !== undefined && de.y !== undefined) labelAt = { x: de.x, y: de.y }
    } else {
      points = curved(a, b)
    }
    if (lines.length > 0 && !labelAt) labelAt = middle(points)
    edges.push({ ...e, points, labelAt, labelLines: lines, labelW: label.w, labelH: label.h, bend: 0 })
  }
  // Two or more edges between the same two nodes (either way) bend apart,
  // and those drawn from the boxes take the bend now; dagre already routed
  // its own apart.
  const pairs = new Map<string, LaidEdge[]>()
  for (const e of edges) {
    const key = [e.from, e.to].sort().join('\u0000')
    pairs.set(key, [...(pairs.get(key) ?? []), e])
  }
  for (const list of pairs.values()) {
    if (list.length < 2) continue
    list.forEach((e, i) => {
      // One each way: each to its own side. More: fanned out.
      e.bend = list.length === 2 && list[0]!.from !== list[1]!.from ? 22 : (i - (list.length - 1) / 2) * 28
      const a = boxOf(e.from)!
      const b = boxOf(e.to)!
      const own = byId.has(e.from) && byId.has(e.to) && !moved.has(e.from) && !moved.has(e.to)
      if (!own && e.from !== e.to) {
        e.points = curved(a, b, e.bend)
        if (e.labelLines.length) e.labelAt = middle(e.points)
      }
    })
  }

  return place(nodes, edges, groups)
}

/**
 * An edge between two boxes placed by hand: from the middle of the side of
 * one that faces the other to the middle of the side facing back, through
 * two points that leave each side square, so the spline curves softly and
 * the arrow meets the box straight. The middle of a side lies on every
 * shape (a rhombus's corner, a circle's edge, a pill's flat).
 */
export function curved(a: Box, b: Box, bend = 0): Point[] {
  const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 }
  const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
  const dx = cb.x - ca.x
  const dy = cb.y - ca.y
  // Up or down when the boxes are more one above the other than side by side.
  const vertical = Math.abs(dy) - (a.h + b.h) / 2 >= Math.abs(dx) - (a.w + b.w) / 2
  let p0: Point, p3: Point, ux: number, uy: number
  if (vertical) {
    const down = dy >= 0
    p0 = { x: ca.x, y: down ? a.y + a.h : a.y }
    p3 = { x: cb.x, y: down ? b.y : b.y + b.h }
    ux = 0
    uy = down ? 1 : -1
  } else {
    const right = dx >= 0
    p0 = { x: right ? a.x + a.w : a.x, y: ca.y }
    p3 = { x: right ? b.x : b.x + b.w, y: cb.y }
    ux = right ? 1 : -1
    uy = 0
  }
  const reach = Math.max(18, Math.min(80, Math.hypot(p3.x - p0.x, p3.y - p0.y) / 3))
  // Bent aside to the right hand of its way: two edges either way between
  // the same nodes go to opposite sides.
  const px = -uy * bend
  const py = ux * bend
  return [
    { x: p0.x + px / 2, y: p0.y + py / 2 },
    { x: p0.x + ux * reach + px, y: p0.y + uy * reach + py },
    { x: p3.x - ux * reach + px, y: p3.y - uy * reach + py },
    { x: p3.x + px / 2, y: p3.y + py / 2 },
  ]
}

/**
 * Where the line from the centre of a box towards p leaves the shape in it:
 * the rhombus of a decision, the circle, else the box.
 */
export function border(box: Box, p: Point, shape: NodeShape = 'box'): Point {
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const dx = p.x - cx
  const dy = p.y - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  let s: number
  if (shape === 'decision') {
    s = 1 / (Math.abs(dx) / (box.w / 2) + Math.abs(dy) / (box.h / 2))
  } else if (shape === 'circle') {
    s = box.w / 2 / Math.hypot(dx, dy)
  } else {
    const sx = dx === 0 ? Infinity : box.w / 2 / Math.abs(dx)
    const sy = dy === 0 ? Infinity : box.h / 2 / Math.abs(dy)
    s = Math.min(sx, sy)
  }
  return { x: cx + dx * s, y: cy + dy * s }
}

/** The point halfway along a polyline. */
function middle(points: Point[]): Point {
  const seg = points.slice(1).map((p, i) => Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y))
  let rest = seg.reduce((s, l) => s + l, 0) / 2
  for (let i = 0; i < seg.length; i++) {
    const l = seg[i]!
    if (rest <= l && l > 0) {
      const a = points[i]!
      const b = points[i + 1]!
      return { x: a.x + ((b.x - a.x) * rest) / l, y: a.y + ((b.y - a.y) * rest) / l }
    }
    rest -= l
  }
  return points[0] ?? { x: 0, y: 0 }
}

/** Moves the drawing to start at MARGIN from 0,0, and measures it. */
function place(nodes: LaidNode[], edges: LaidEdge[], groups: LaidGroup[]): Laid {
  const xs: number[] = []
  const ys: number[] = []
  for (const b of [...nodes, ...groups]) xs.push(b.x, b.x + b.w), ys.push(b.y, b.y + b.h)
  for (const e of edges) {
    for (const p of e.points) xs.push(p.x), ys.push(p.y)
    if (e.labelAt) xs.push(e.labelAt.x), ys.push(e.labelAt.y)
  }
  if (xs.length === 0) return { nodes, edges, groups, width: 2 * MARGIN, height: 2 * MARGIN }
  const dx = MARGIN - Math.min(...xs)
  const dy = MARGIN - Math.min(...ys)
  for (const b of [...nodes, ...groups]) (b.x += dx), (b.y += dy)
  for (const e of edges) {
    for (const p of e.points) (p.x += dx), (p.y += dy)
    if (e.labelAt) (e.labelAt.x += dx), (e.labelAt.y += dy)
  }
  return {
    nodes,
    edges,
    groups,
    width: Math.ceil(Math.max(...xs) + dx + MARGIN),
    height: Math.ceil(Math.max(...ys) + dy + MARGIN),
  }
}

/**
 * The SVG path of an edge through its points: a B-spline (d3's curveBasis,
 * as dagre's own renderers draw), straight when there are two points. It
 * starts and ends on the first and last point.
 */
export function edgePath(points: Point[]): string {
  const f = (n: number) => String(Math.round(n * 10) / 10)
  if (points.length === 0) return ''
  const p0 = points[0]!
  if (points.length < 3) {
    const p1 = points[points.length - 1]!
    return `M${f(p0.x)} ${f(p0.y)}L${f(p1.x)} ${f(p1.y)}`
  }
  let d = `M${f(p0.x)} ${f(p0.y)}`
  let [x0, y0] = [p0.x, p0.y]
  let [x1, y1] = [points[1]!.x, points[1]!.y]
  d += `L${f((5 * x0 + x1) / 6)} ${f((5 * y0 + y1) / 6)}`
  for (const p of points.slice(2)) {
    d += `C${f((2 * x0 + x1) / 3)} ${f((2 * y0 + y1) / 3)} ${f((x0 + 2 * x1) / 3)} ${f((y0 + 2 * y1) / 3)} ${f((x0 + 4 * x1 + p.x) / 6)} ${f((y0 + 4 * y1 + p.y) / 6)}`
    ;[x0, y0, x1, y1] = [x1, y1, p.x, p.y]
  }
  d += `C${f((2 * x0 + x1) / 3)} ${f((2 * y0 + y1) / 3)} ${f((x0 + 2 * x1) / 3)} ${f((y0 + 2 * y1) / 3)} ${f((x0 + 5 * x1) / 6)} ${f((y0 + 5 * y1) / 6)}`
  d += `L${f(x1)} ${f(y1)}`
  return d
}
