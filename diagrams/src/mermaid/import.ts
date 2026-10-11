import type { NodeClass, NodeShape } from '../model/types'
import { NODE_CLASSES } from '../model/types'
import { YamlOut, type OutBranch } from '../convert/yaml'
import { withMermaid } from './render'

// Mermaid source made a diagram of the format, read by Mermaid's own parser
// (the diagram's database once parsed): a flowchart, a mind map, a Gantt
// and a quadrant chart. What the format has no place for (a style, a shape
// it does not know, a nested subgraph) is left out and said in a warning.

/** A conversion that cannot be made: the text does not read, or its kind has no equivalent. */
export class DiagramConvertError extends Error {}

export interface ConvertResult {
  /** The diagram's YAML. */
  source: string
  /** What the conversion left out or changed, in words. */
  warnings: string[]
}

const idRe = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/

/** Mermaid's placeholders of entities (#35;, #quot;) back to their characters, and <br> to a line break. */
export function mermaidPlain(s: string): string {
  const named: Record<string, string> = { quot: '"', amp: '&', lt: '<', gt: '>', nbsp: ' ', apos: "'" }
  return s
    .replace(/ﬂ°°(\d+)¶ß/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/ﬂ°(\w+)¶ß/g, (m, n: string) => named[n] ?? m)
    .replace(/&?#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/[&#](quot|amp|lt|gt|nbsp|apos);/g, (_, n: string) => named[n]!)
    .replace(/<br\s*\/?>/gi, '\n')
    .trim()
}

/** Ids of the format for the ids of a source: kept when valid and free, else made from a prefix. */
function ids(prefix: string, taken = new Set<string>()) {
  const map = new Map<string, string>()
  return {
    taken,
    get(id: string): string {
      let out = map.get(id)
      if (out) return out
      out = idRe.test(id) && !taken.has(id) ? id : ''
      let i = 1
      while (!out || taken.has(out)) out = `${prefix}${i++}`
      map.set(id, out)
      taken.add(out)
      return out
    },
    has: (id: string) => map.has(id),
  }
}

const SHAPES: Record<string, NodeShape> = {
  square: 'box',
  rect: 'box',
  round: 'pill',
  stadium: 'pill',
  diamond: 'decision',
  hexagon: 'decision',
  lean_right: 'data',
  lean_left: 'data',
  trapezoid: 'data',
  inv_trapezoid: 'data',
  cylinder: 'db',
  circle: 'circle',
  doublecircle: 'circle',
  subroutine: 'doc',
  doc: 'doc',
  docs: 'doc',
  odd: 'note',
  braces: 'note',
}

interface FlowVertex {
  id: string
  text?: string
  type?: string
  classes?: string[]
  link?: string
}
interface FlowEdge {
  start: string
  end: string
  text?: string
  stroke?: string
  type?: string
}
interface FlowSubgraph {
  id: string
  title?: string
  nodes: string[]
}
interface FlowDb {
  getDirection?: () => string
  getVertices: () => Map<string, FlowVertex> | Record<string, FlowVertex>
  getEdges: () => FlowEdge[]
  getSubGraphs: () => FlowSubgraph[]
  getAccTitle?: () => string
  getDiagramTitle?: () => string
}

function flowFrom(db: FlowDb, warnings: Set<string>): string {
  const out = new YamlOut()
  out.set('kind', 'flow')
  const title = mermaidPlain(db.getDiagramTitle?.() || db.getAccTitle?.() || '')
  out.set('title', title)
  const dir = (db.getDirection?.() ?? 'TB').toUpperCase().replace('TD', 'TB')
  if (['LR', 'BT', 'RL'].includes(dir)) out.set('direction', dir)
  const raw = db.getVertices()
  const vertices = raw instanceof Map ? [...raw.values()] : Object.values(raw)
  const groups = db.getSubGraphs()
  // The groups' ids first, so that no node takes one.
  const gid = ids('g')
  for (const g of groups) gid.get(g.id)
  const id = ids('n', gid.taken)
  const nodes = vertices.map((v) => {
    const type = v.type ?? 'square'
    const shape = SHAPES[type]
    if (!shape) warnings.add(`the shape ${type} is a box`)
    const cls = (v.classes ?? []).find((c): c is NodeClass => (NODE_CLASSES as readonly string[]).includes(c))
    const link = v.link && /^https?:\/\//.test(v.link) ? v.link : ''
    const label = mermaidPlain(v.text ?? v.id)
    const nid = id.get(v.id)
    return { id: nid, label: label === nid ? '' : label, shape: shape && shape !== 'box' ? shape : '', class: cls ?? '', link }
  })
  // A node is in one group at most, and a group holds no group: Mermaid
  // lists the inner subgraphs first, so a node goes to the innermost.
  const placed = new Set<string>()
  const outGroups = groups.map((g) => {
    const members: string[] = []
    for (const m of g.nodes) {
      if (groups.some((x) => x.id === m)) {
        warnings.add('a subgraph inside another is a group of its own')
        continue
      }
      if (placed.has(m) || !id.has(m)) continue
      placed.add(m)
      members.push(id.get(m))
    }
    return { id: gid.get(g.id), label: mermaidPlain(g.title ?? ''), nodes: members }
  })
  const end = (x: string) => (id.has(x) ? id.get(x) : groups.some((g) => g.id === x) ? gid.get(x) : '')
  const edges = db.getEdges().flatMap((e) => {
    const from = end(e.start)
    const to = end(e.end)
    if (!from || !to) return []
    if (e.type === 'arrow_open' || e.type === 'arrow_cross' || e.type === 'arrow_circle' || e.type === 'double_arrow_point') {
      warnings.add('every line is an arrow from its first node to its second')
    }
    if (e.stroke === 'invisible') return []
    return [YamlOut.edge(from, to, mermaidPlain(e.text ?? ''), e.stroke === 'dotted' ? 'dotted' : 'solid')]
  })
  out.nodes(nodes.map((n) => (n.label || n.shape || n.class || n.link ? n : n.id)))
  out.list('edges', edges)
  out.list('groups', outGroups.map((g) => ({ ...g, label: g.label === g.id ? '' : g.label })))
  return out.toString()
}

interface MindNode {
  descr?: string
  children?: MindNode[]
}

function mindmapFrom(root: MindNode | undefined): string {
  if (!root) throw new DiagramConvertError('the mind map has no root')
  const walk = (n: MindNode): OutBranch => ({ label: mermaidPlain(n.descr ?? ''), children: (n.children ?? []).map(walk) })
  const out = new YamlOut()
  out.set('kind', 'mindmap')
  out.tree(walk(root))
  return out.toString()
}

interface GanttTaskDb {
  id: string
  task: string
  section?: string
  prevTaskId?: string
  startTime: Date | string
  endTime: Date | string
  done?: boolean
  active?: boolean
  crit?: boolean
  milestone?: boolean
  raw?: { startTime?: { type?: string; startData?: string }; endTime?: { data?: string } }
}
interface GanttDb {
  getTasks: () => GanttTaskDb[]
  getSections?: () => string[]
  getDiagramTitle?: () => string
  getExcludes?: () => string[]
}

/** A day as YYYY-MM-DD, in the time zone Mermaid read it in (the page's). */
const ymd = (t: Date) =>
  `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`

function ganttFrom(db: GanttDb, warnings: Set<string>): string {
  const tasks = db.getTasks()
  if (!tasks.length) throw new DiagramConvertError('the Gantt has no tasks')
  if (db.getExcludes?.().length) warnings.add('excluded days are not kept: a task lasts its calendar days')
  const referenced = new Set(tasks.map((t) => t.prevTaskId).filter(Boolean))
  const id = ids('t')
  const keep = (t: GanttTaskDb) => referenced.has(t.id) || !/^task\d+$/.test(t.id)
  for (const t of tasks) if (keep(t)) id.get(t.id)
  const sections: { label: string; tasks: Record<string, unknown>[] }[] = []
  for (const t of tasks) {
    const label = mermaidPlain(t.section ?? '')
    let s = sections[sections.length - 1]
    if (!s || s.label !== label) {
      s = { label, tasks: [] }
      sections.push(s)
    }
    const flags = (['milestone', 'crit', 'active', 'done'] as const).filter((f) => t[f])
    if (flags.length > 1) warnings.add('a task has one status: milestone, then critical, active, done')
    const status = flags[0] === 'crit' ? 'critical' : (flags[0] ?? '')
    const startData = t.raw?.startTime?.startData ?? ''
    const after = /^after\s/.test(startData) && t.prevTaskId ? t.prevTaskId : ''
    if (after && startData.trim().split(/\s+/).length > 2) warnings.add('a task comes after one task, the first one named')
    const start = new Date(t.startTime)
    const end = new Date(t.endTime)
    const duration = /^(\d+)([dw])$/.exec(t.raw?.endTime?.data?.trim() ?? '')
    let days = 0
    let last = ''
    if (status !== 'milestone') {
      if (duration && Number(duration[1]) > 0) days = Number(duration[1]) * (duration[2] === 'w' ? 7 : 1)
      // Mermaid's end is the moment the task is over: the format's is its last day.
      else last = ymd(new Date(Math.max(start.getTime(), end.getTime() - 1)))
    }
    s.tasks.push({
      id: keep(t) ? id.get(t.id) : '',
      label: mermaidPlain(t.task),
      start: after ? '' : ymd(start),
      after: after ? id.get(after) : '',
      end: last,
      days: days || undefined,
      status,
    })
  }
  const out = new YamlOut()
  out.set('kind', 'gantt')
  out.set('title', mermaidPlain(db.getDiagramTitle?.() ?? ''))
  if (sections.length === 1 && !sections[0]!.label) out.list('tasks', sections[0]!.tasks)
  else out.sections(sections)
  return out.toString()
}

interface QuadrantData {
  points: { x: number; y: number; text: { text: string } }[]
  quadrants: { x: number; y: number; width: number; height: number; text: { text: string } }[]
  axisLabels: { text: string }[]
}
interface QuadrantDb {
  getQuadrantData: () => QuadrantData
  getDiagramTitle?: () => string
}

function quadrantFrom(db: QuadrantDb, source: string): string {
  const data = db.getQuadrantData()
  const q = data.quadrants
  if (q.length !== 4) throw new DiagramConvertError('the quadrant chart has no quadrants')
  const left = Math.min(...q.map((b) => b.x))
  const top = Math.min(...q.map((b) => b.y))
  const right = Math.max(...q.map((b) => b.x + b.width))
  const bottom = Math.max(...q.map((b) => b.y + b.height))
  const r2 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 100) / 100
  // The axes' texts are in the source: their place in the data depends on the chart's layout.
  const axis = (name: string) => {
    const m = new RegExp(`^\\s*${name}\\s+(.+?)\\s*(?:-->\\s*(.+?))?\\s*$`, 'm').exec(source)
    const unq = (s?: string) => mermaidPlain((s ?? '').replace(/^"(.*)"$/, '$1'))
    return { label: '', low: unq(m?.[1]), high: unq(m?.[2]) }
  }
  const items = data.points
    .map((p) => ({ label: mermaidPlain(p.text.text), x: r2((p.x - left) / (right - left)), y: r2(1 - (p.y - top) / (bottom - top)) }))
    .reverse()
  const out = new YamlOut()
  out.set('kind', 'matrix')
  out.set('title', mermaidPlain(db.getDiagramTitle?.() ?? ''))
  out.flowMap('x', axis('x-axis'))
  out.flowMap('y', axis('y-axis'))
  // Mermaid's quadrants are top right, top left, bottom left, bottom right.
  const t = q.map((b) => mermaidPlain(b.text.text))
  out.flowList('quadrants', [t[1], t[0], t[2], t[3]])
  out.list('items', items)
  return out.toString()
}

/**
 * Mermaid source as a diagram of the format: a flowchart (graph), a mind
 * map, a Gantt or a quadrant chart. Loads Mermaid; throws
 * DiagramConvertError when the source does not read or is another kind.
 */
export function fromMermaid(source: string): Promise<ConvertResult> {
  return withMermaid(async (mermaid) => {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
    let parsed: { type: string; db: unknown }
    try {
      parsed = (await mermaid.mermaidAPI.getDiagramFromText(source)) as unknown as { type: string; db: unknown }
    } catch (e) {
      const msg = e instanceof Error ? e.message.split('\n')[0] : String(e)
      throw new DiagramConvertError(`the Mermaid does not read: ${msg}`)
    }
    const warnings = new Set<string>()
    let yaml: string
    switch (parsed.type) {
      case 'flowchart-v2':
      case 'flowchart':
      case 'flowchart-elk':
        yaml = flowFrom(parsed.db as FlowDb, warnings)
        break
      case 'mindmap':
        yaml = mindmapFrom((parsed.db as { getMindmap: () => MindNode | undefined }).getMindmap())
        break
      case 'gantt':
        yaml = ganttFrom(parsed.db as GanttDb, warnings)
        break
      case 'quadrantChart':
        yaml = quadrantFrom(parsed.db as QuadrantDb, source)
        break
      default:
        throw new DiagramConvertError(
          `a Mermaid ${parsed.type} has no equivalent: a flowchart, a mind map, a Gantt and a quadrant chart convert`,
        )
    }
    if (/^\s*(style|classDef|linkStyle)\b/m.test(source) && parsed.type !== 'gantt') warnings.add('styles are not kept')
    return { source: yaml, warnings: [...warnings] }
  })
}
