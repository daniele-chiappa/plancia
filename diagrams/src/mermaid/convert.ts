import type { Diagram, DiagramBranch, GanttTask, NodeShape } from '../model/types'
import { treeGraph } from '../layout/graph'

// A diagram as Mermaid source, for every kind: the view draws the mind
// map, the fishbone, the Venn and the Gantt with it, and the export and the
// twin a note keeps for Obsidian are this text. The YAML stays the source.

/** The kinds this package draws with Mermaid. */
export const MERMAID_KINDS = ['mindmap', 'fishbone', 'venn', 'gantt'] as const

export interface MermaidOptions {
  /** The title in the Mermaid (default true); a drawing under its own caption leaves it out. */
  title?: boolean
  /**
   * Only what any Mermaid 11 draws: a fishbone becomes a mind map, since
   * ishikawa is recent. For the twin, which another app's Mermaid draws.
   */
  portable?: boolean
}

const ENTITIES: Record<string, string> = { '#': '#35;', '"': '#quot;', $: '#36;', '`': '#96;', ':': '#58;', ';': '#59;' }

/**
 * A label as Mermaid text: one line, its quotes and the characters Mermaid
 * reads as markup written as entities. `$` too, so that no label ever
 * reaches Mermaid's maths (KaTeX). Mermaid turns the entities into
 * placeholders before it parses, so they are safe in any place of a line.
 */
export function mermaidText(label: string): string {
  return label
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[#"$`]/g, (c) => ENTITIES[c]!)
}

/** mermaidText, with the separators of line syntaxes (the Gantt's : and ;) written as entities too. */
const lineText = (label: string) =>
  label
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[#"$`:;]/g, (c) => ENTITIES[c]!)

const q = (label: string) => `"${mermaidText(label)}"`

/** An id as Mermaid reads it: the diagram's own when it is safe, else one made from its place. */
function idMaker(reserved: Set<string>, prefix: string) {
  const used = new Map<string, string>()
  const taken = new Set<string>()
  return (id: string): string => {
    const known = used.get(id)
    if (known) return known
    let out = /^[A-Za-z][A-Za-z0-9_]*$/.test(id) && !reserved.has(id.toLowerCase()) ? id : ''
    let i = used.size
    while (out === '' || taken.has(out)) out = `${prefix}${i++}`
    used.set(id, out)
    taken.add(out)
    return out
  }
}

const FLOW_WORDS = new Set([
  'end', 'graph', 'flowchart', 'flowchart-elk', 'subgraph', 'style', 'class', 'classdef', 'click',
  'linkstyle', 'default', 'direction', 'call', 'href', 'interpolate', 'acctitle', 'accdescr',
])

const SHAPES: Record<NodeShape, [string, string]> = {
  box: ['[', ']'],
  pill: ['([', '])'],
  decision: ['{', '}'],
  data: ['[/', '/]'],
  doc: ['[[', ']]'],
  db: ['[(', ')]'],
  circle: ['((', '))'],
  note: ['>', ']'],
}

// The classes of the format, in the colours of the light palette.
const CLASS_DEFS: Record<string, string> = {
  user: 'fill:#e3edfd,stroke:#3b82f6',
  data: 'fill:#e6f4ea,stroke:#d0d7de',
  ext: 'fill:#f1ebfb,stroke:#d0d7de',
  planned: 'fill:#ffffff,stroke:#d0d7de,stroke-dasharray:5 4',
  off: 'opacity:0.45',
}

function flowchart(d: Diagram): string {
  const id = idMaker(FLOW_WORDS, 'n')
  const lines = [`flowchart ${d.direction}`]
  if (d.title) lines.push(`  accTitle: ${lineText(d.title)}`)
  const classes = new Map<string, string[]>()
  for (const n of d.nodes) {
    const [open, close] = SHAPES[n.shape] ?? SHAPES.box
    lines.push(`  ${id(n.id)}${open}${q(n.label)}${close}`)
    if (n.class) classes.set(n.class, [...(classes.get(n.class) ?? []), id(n.id)])
  }
  for (const g of d.groups) {
    lines.push(`  subgraph ${id(g.id)}[${q(g.label || g.id)}]`)
    for (const m of g.nodes) lines.push(`    ${id(m)}`)
    lines.push('  end')
  }
  const dotted: number[] = []
  d.edges.forEach((e, i) => {
    const arrow = e.style === 'solid' ? '-->' : '-.->'
    if (e.style === 'dotted') dotted.push(i)
    lines.push(`  ${id(e.from)} ${arrow}${e.label ? `|${q(e.label)}|` : ''} ${id(e.to)}`)
  })
  for (const i of dotted) lines.push(`  linkStyle ${i} stroke-dasharray:1.5 3.5`)
  for (const [cls, ids] of classes) {
    lines.push(`  classDef ${cls} ${CLASS_DEFS[cls]}`, `  class ${ids.join(',')} ${cls}`)
  }
  for (const n of d.nodes) {
    if (/^https?:\/\//.test(n.link)) lines.push(`  click ${id(n.id)} href "${n.link.replace(/"/g, '%22')}" _blank`)
  }
  return lines.join('\n') + '\n'
}

function treeChart(d: Diagram): string {
  const g = treeGraph(d)
  const id = idMaker(FLOW_WORDS, 'n')
  const lines = [`flowchart ${d.direction}`]
  for (const n of g.nodes) {
    const [open, close] = n.depth === 0 ? SHAPES.pill : SHAPES.box
    lines.push(`  ${id(n.id)}${open}${q(n.label)}${close}`)
  }
  for (const e of g.edges) lines.push(`  ${id(e.from)} --> ${id(e.to)}`)
  return lines.join('\n') + '\n'
}

function mindmap(root: DiagramBranch): string {
  const lines = ['mindmap']
  let seq = 0
  const walk = (b: DiagramBranch, depth: number) => {
    const id = `n${seq++}`
    const text = q(b.label)
    lines.push(`${'  '.repeat(depth + 1)}${id}${depth === 0 ? `((${text}))` : `[${text}]`}`)
    for (const c of b.children) walk(c, depth + 1)
  }
  walk(root, 0)
  return lines.join('\n') + '\n'
}

function ishikawa(root: DiagramBranch): string {
  // ishikawa reads a line per node, its depth from the indent: the first
  // is the effect, then the categories, then the causes. A line is plain
  // text, so only the comment mark %% and line breaks need care.
  const lines = ['ishikawa']
  const walk = (b: DiagramBranch, depth: number) => {
    const text = b.label.replace(/\s+/g, ' ').trim().replace(/^%%/, '% %')
    lines.push(`${'    '.repeat(depth + 1)}${text || '…'}`)
    for (const c of b.children) walk(c, depth + 1)
  }
  walk(root, 0)
  return lines.join('\n') + '\n'
}

const VENN_WORDS = new Set(['set', 'union', 'text', 'style', 'title', 'venn-beta'])

function venn(d: Diagram, title: boolean): string {
  const id = idMaker(VENN_WORDS, 's')
  const lines = ['venn-beta']
  if (d.title && title) lines.push(`  title ${lineText(d.title)}`)
  for (const s of d.sets) lines.push(`  set ${id(s.id)}[${q(s.label)}]`)
  for (const a of d.areas) {
    const label = a.label ? `[${q(a.label)}]` : ''
    const size = a.size > 0 ? `: ${a.size}` : ''
    if (a.sets.length === 1) lines.push(`  text ${id(a.sets[0]!)} ${q(a.label)}`)
    else lines.push(`  union ${a.sets.map(id).join(',')}${label}${size}`)
  }
  return lines.join('\n') + '\n'
}

function quadrants(d: Diagram, title: boolean): string {
  const m = d.matrix!
  const lines = ['quadrantChart']
  if (d.title && title) lines.push(`  title ${lineText(d.title)}`)
  for (const [name, axis] of [['x-axis', m.x], ['y-axis', m.y]] as const) {
    if (!axis) continue
    if (axis.low || axis.high) lines.push(`  ${name} ${q(axis.low || axis.label)} --> ${q(axis.high || axis.label)}`)
    else if (axis.label) lines.push(`  ${name} ${q(axis.label)}`)
  }
  // Mermaid numbers them top right, top left, bottom left, bottom right.
  const [tl, tr, bl, br] = m.quadrants
  ;[tr, tl, bl, br].forEach((label, i) => {
    if (label) lines.push(`  quadrant-${i + 1} ${q(label)}`)
  })
  for (const it of m.items) lines.push(`  ${q(it.label)}: [${it.x}, ${it.y}]`)
  return lines.join('\n') + '\n'
}

function grid(d: Diagram): string {
  const m = d.matrix!
  const lines = ['block-beta', `  columns ${m.columns.length + 1}`]
  lines.push(`  space ${m.columns.map((c, j) => `h${j}[${q(c)}]`).join(' ')}`)
  m.rows.forEach((r, i) => {
    const cells = m.columns.map((_, j) => {
      const c = m.cells[i]?.[j] ?? ''
      return c ? `c${i}_${j}[${q(c)}]` : 'space'
    })
    lines.push(`  r${i}[${q(r)}] ${cells.join(' ')}`)
  })
  return lines.join('\n') + '\n'
}

/** The day after a YYYY-MM-DD: Mermaid's end is the moment the task is over, the format's its last day. */
export function nextDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y!, m! - 1, d! + 1))
  return t.toISOString().slice(0, 10)
}

/** A tick a day for a short Gantt, a week for a longer one, a month beyond: Mermaid's own ticks repeat the day. */
function ticks(d: Diagram): string {
  const days = (date: string) => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 86400000
  const dates = d.sections.flatMap((s) => s.tasks.flatMap((t) => [t.start, t.end].filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))))
  const length = d.sections.reduce((n, s) => n + s.tasks.reduce((m, t) => m + Math.max(t.days, 1), 0), 0)
  const span = dates.length ? Math.max(Math.max(...dates.map(days)) - Math.min(...dates.map(days)), length) : length
  if (span <= 21) return '1day'
  if (span <= 120) return '1week'
  return '1month'
}

function gantt(d: Diagram, title: boolean): string {
  const id = idMaker(new Set(['after', 'done', 'active', 'crit', 'milestone']), 't')
  const lines = ['gantt']
  if (d.title && title) lines.push(`  title ${lineText(d.title)}`)
  lines.push('  dateFormat YYYY-MM-DD')
  const tick = ticks(d)
  if (tick) lines.push(`  tickInterval ${tick}`)
  const task = (t: GanttTask) => {
    const meta: string[] = []
    if (t.status === 'critical') meta.push('crit')
    else if (t.status) meta.push(t.status)
    if (t.id) meta.push(id(t.id))
    meta.push(t.after ? `after ${id(t.after)}` : t.start)
    if (t.end) meta.push(nextDay(t.end))
    else if (t.days > 0) meta.push(`${t.days}d`)
    else meta.push('0d')
    return `    ${lineText(t.label) || '…'} :${meta.join(', ')}`
  }
  // A task that does not read (no start, or after no task) is left out:
  // Mermaid would not draw the others either.
  const ids = new Set(d.sections.flatMap((s) => s.tasks.map((t) => t.id)).filter(Boolean))
  const drawable = (t: GanttTask) => (t.after ? ids.has(t.after) : /^\d{4}-\d{2}-\d{2}$/.test(t.start))
  for (const s of d.sections) {
    if (s.label) lines.push(`  section ${lineText(s.label)}`)
    for (const t of s.tasks) if (drawable(t)) lines.push(task(t))
  }
  return lines.join('\n') + '\n'
}

/** Mermaid source for a diagram; '' when there is nothing to draw. */
export function toMermaid(d: Diagram, opts: MermaidOptions = {}): string {
  const title = opts.title !== false
  switch (d.kind) {
    case 'flow':
      return d.nodes.length ? flowchart(d) : ''
    case 'tree':
      return d.root ? treeChart(d) : ''
    case 'mindmap':
      return d.root ? mindmap(d.root) : ''
    case 'fishbone':
      if (!d.root) return ''
      return opts.portable ? mindmap(d.root) : ishikawa(d.root)
    case 'venn':
      return d.sets.length ? venn(d, title) : ''
    case 'matrix':
      if (!d.matrix) return ''
      return d.matrix.rows.length ? grid(d) : quadrants(d, title)
    case 'gantt':
      return d.sections.some((s) => s.tasks.length) ? gantt(d, title) : ''
  }
}
