import type { Diagram, DiagramBranch } from './types'

// A diagram said in words: the drawing's text alternative, and what an
// agent reads beside the YAML. A port of gosidian's internal/diagram/text.go,
// so the two say the same; the words are English, like the server's.

/** The text is cut at this many characters. */
const MAX_TEXT = 1500

function count(n: number, what: string): string {
  return n === 1 ? `1 ${what}` : `${n} ${what}s`
}

function or(a: string | undefined, b: string): string {
  return a ? a : b
}

function writeBranch(br: DiagramBranch): string {
  if (br.children.length === 0) return br.label
  return `${br.label} (${br.children.map(writeBranch).join(', ')})`
}

/** Go's %q, as the server writes it. */
function q(s: string): string {
  return JSON.stringify(s)
}

export function diagramText(d: Diagram | null): string {
  if (!d) return ''
  let b = ''
  switch (d.kind) {
    case 'flow': {
      const labels = new Map<string, string>()
      for (const n of d.nodes) labels.set(n.id, n.label)
      for (const g of d.groups) labels.set(g.id, g.label)
      b += `Flow (${d.direction}), ${count(d.nodes.length, 'node')}, ${count(d.edges.length, 'edge')}`
      if (d.groups.length > 0) b += `, ${count(d.groups.length, 'group')}`
      b += ':'
      d.edges.forEach((e, i) => {
        if (i > 0) b += ';'
        b += ` ${or(labels.get(e.from), e.from)} → ${or(labels.get(e.to), e.to)}`
        if (e.label !== '') b += ` (${e.label})`
      })
      // The nodes no edge reaches, so none goes unsaid.
      const linked = new Set<string>()
      for (const e of d.edges) linked.add(e.from).add(e.to)
      const alone = d.nodes.filter((n) => !linked.has(n.id)).map((n) => n.label)
      if (alone.length > 0) b += `; unconnected: ${alone.join(', ')}`
      break
    }
    case 'tree':
    case 'mindmap':
    case 'fishbone': {
      const name = { tree: 'Tree', mindmap: 'Mind map', fishbone: 'Fishbone' }[d.kind]
      if (!d.root) return name
      b += d.kind === 'fishbone' ? `Fishbone of the effect ${q(d.root.label)}:` : `${name} of ${q(d.root.label)}:`
      d.root.children.forEach((c, i) => {
        if (i > 0) b += ';'
        b += ` ${writeBranch(c)}`
      })
      break
    }
    case 'venn': {
      const labels = new Map<string, string>()
      for (const s of d.sets) labels.set(s.id, s.label)
      b += `Venn of ${count(d.sets.length, 'set')}: ${d.sets.map((s) => s.label).join(', ')}`
      for (const a of d.areas) {
        b += `; ${a.sets.map((s) => or(labels.get(s), s)).join(' ∩ ')}`
        if (a.label !== '') b += `: ${a.label}`
      }
      break
    }
    case 'matrix': {
      const m = d.matrix
      if (!m) return 'Matrix'
      if (m.rows.length > 0) {
        b += `Matrix of ${count(m.rows.length, 'row')} by ${count(m.columns.length, 'column')} (${m.rows.join(', ')} × ${m.columns.join(', ')})`
        m.cells.forEach((row, i) => {
          if (i >= m.rows.length) return
          const cells = row.flatMap((c, j) => (c !== '' && j < m.columns.length ? [`${m.columns[j]}: ${c}`] : []))
          if (cells.length > 0) b += `; ${m.rows[i]} — ${cells.join(', ')}`
        })
        break
      }
      const x = m.x?.label || 'x'
      const y = m.y?.label || 'y'
      b += `Quadrant matrix, ${x} across, ${y} up`
      if (m.quadrants.length === 4) {
        const [tl, tr, bl, br] = m.quadrants
        b += `; quadrants: top left ${tl}, top right ${tr}, bottom left ${bl}, bottom right ${br}`
      }
      for (const it of m.items) b += `; ${it.label} at (${String(it.x)}, ${String(it.y)})`
      break
    }
    case 'gantt': {
      const n = d.sections.reduce((sum, s) => sum + s.tasks.length, 0)
      const labels = new Map<string, string>()
      for (const s of d.sections) for (const t of s.tasks) if (t.id !== '') labels.set(t.id, t.label)
      b += `Gantt, ${count(n, 'task')}`
      for (const s of d.sections) {
        if (s.label !== '') b += `; ${s.label}:`
        s.tasks.forEach((t, i) => {
          if (i > 0 || s.label === '') b += ';'
          b += ` ${t.label}`
          if (t.start !== '') b += ` from ${t.start}`
          else if (t.after !== '') b += ` after ${or(labels.get(t.after), t.after)}`
          if (t.end !== '') b += ` to ${t.end}`
          else if (t.days > 0) b += ` for ${count(t.days, 'day')}`
          if (t.status !== '') b += ` [${t.status}]`
        })
      }
      break
    }
  }
  let text = b.trim()
  if (d.title !== '') text = `${d.title} — ${text}`
  // The server cuts at 1,500 bytes of UTF-8, not inside a character.
  const bytes = new TextEncoder().encode(text)
  if (bytes.length > MAX_TEXT) {
    let cut = MAX_TEXT
    while (cut > 0 && (bytes[cut]! & 0xc0) === 0x80) cut--
    text = new TextDecoder().decode(bytes.slice(0, cut)) + '…'
  }
  return text
}
