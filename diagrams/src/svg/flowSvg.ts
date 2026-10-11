import type { Laid } from '../layout/layout'
import { edgePath } from '../layout/layout'
import { FONT_SIZE, LINE_HEIGHT, labelTop, shapePaths } from '../layout/shapes'
import type { Palette } from '../theme'

// A flow or a tree as an SVG file of its own: the same geometry as the view
// (shapes.ts, layout.ts), its colours resolved, its text as SVG text. For
// the export, and later for the twin Obsidian shows beside the YAML.

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const num = (n: number) => String(Math.round(n * 10) / 10)

export interface SvgText {
  title?: string
  description?: string
}

function fillOf(cls: string, root: boolean, p: Palette): { fill: string; stroke: string; dash: string } {
  if (root) return { fill: p.accentSoft, stroke: p.accent, dash: '' }
  switch (cls) {
    case 'user':
      return { fill: p.user, stroke: p.accent, dash: '' }
    case 'data':
      return { fill: p.data, stroke: p.border, dash: '' }
    case 'ext':
      return { fill: p.ext, stroke: p.border, dash: '' }
    case 'planned':
      return { fill: p.surface, stroke: p.border, dash: '5 4' }
    default:
      return { fill: p.node, stroke: p.border, dash: '' }
  }
}

const dashes: Record<string, string> = { dashed: '6 4', dotted: '1.5 3.5' }

/** The SVG of a laid-out flow or tree. `tree` marks its root as the view does. */
export function flowToSVG(laid: Laid, p: Palette, text: SvgText = {}, tree = false): string {
  const { width, height } = laid
  const out: string[] = []
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${esc(p.fontFamily)}" font-size="${FONT_SIZE}">`,
  )
  if (text.title) out.push(`<title>${esc(text.title)}</title>`)
  if (text.description) out.push(`<desc>${esc(text.description)}</desc>`)
  out.push(
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${p.edge}"/></marker></defs>`,
  )
  out.push(`<rect width="${width}" height="${height}" fill="${p.surface}"/>`)
  for (const g of laid.groups) {
    out.push(
      `<g><rect x="${num(g.x)}" y="${num(g.y)}" width="${num(g.w)}" height="${num(g.h)}" rx="8" fill="${p.group}" stroke="${p.border}" stroke-dasharray="4 3"/>` +
        `<text x="${num(g.x + 10)}" y="${num(g.y + 16)}" font-size="12" fill="${p.muted}">${esc(g.label)}</text></g>`,
    )
  }
  for (const e of laid.edges) {
    const dash = dashes[e.style] ? ` stroke-dasharray="${dashes[e.style]}"` : ''
    out.push(
      `<path d="${edgePath(e.points)}" fill="none" stroke="${p.edge}" stroke-width="1.4"${dash} marker-end="url(#arrow)"/>`,
    )
    if (e.labelAt && e.labelLines.length > 0) {
      const x = e.labelAt.x - e.labelW / 2
      const y = e.labelAt.y - e.labelH / 2
      const lines = e.labelLines
        .map((l, i) => `<tspan x="${num(e.labelAt!.x)}" y="${num(y + 2 + LINE_HEIGHT * (i + 0.72))}">${esc(l)}</tspan>`)
        .join('')
      out.push(
        `<g><rect x="${num(x)}" y="${num(y)}" width="${num(e.labelW)}" height="${num(e.labelH)}" rx="3" fill="${p.surface}"/>` +
          `<text text-anchor="middle" font-size="12" fill="${p.muted}">${lines}</text></g>`,
      )
    }
  }
  for (const n of laid.nodes) {
    const root = tree && n.depth === 0
    const { fill, stroke, dash } = fillOf(n.cls, root, p)
    const [outline, line] = shapePaths(n.shape, n.w, n.h)
    const top = labelTop(n.shape, n.h, n.lines.length)
    const color = n.link ? p.accent : p.text
    const tspans = n.lines
      .map((l, i) => `<tspan x="${num(n.w / 2)}" y="${num(top + LINE_HEIGHT * (i + 0.72))}">${esc(l)}</tspan>`)
      .join('')
    const open = n.cls === 'off' ? ' opacity="0.45"' : ''
    out.push(
      `<g transform="translate(${num(n.x)} ${num(n.y)})"${open}>` +
        `<path d="${outline}" fill="${fill}" stroke="${stroke}" stroke-width="1.25"${dash ? ` stroke-dasharray="${dash}"` : ''}/>` +
        (line ? `<path d="${line}" fill="none" stroke="${stroke}" stroke-width="1.25"/>` : '') +
        `<text text-anchor="middle" fill="${color}"${n.link ? ' text-decoration="underline"' : ''}>${tspans}</text></g>`,
    )
  }
  out.push('</svg>')
  return out.join('\n') + '\n'
}
