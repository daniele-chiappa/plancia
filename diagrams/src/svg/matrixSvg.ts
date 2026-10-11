import type { MatrixSpec } from '../model/types'
import { FONT_SIZE, LINE_HEIGHT, wrapLabel, type Measure } from '../layout/shapes'
import type { Palette } from '../theme'

// A matrix drawn by the package: the quadrants with their axes and points,
// or the grid as a table. One SVG for the view (its points carry
// data-item, for the editor to drag them) and for the export.

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const num = (n: number) => String(Math.round(n * 10) / 10)

export interface SvgText {
  title?: string
  description?: string
}

/** Where the plot of a quadrant matrix is in its SVG: x and y of a point from 0 to 1 map into it. */
export interface MatrixPlot {
  x: number
  y: number
  w: number
  h: number
}

export const QUADRANT_PLOT: MatrixPlot = { x: 56, y: 10, w: 520, h: 400 }
const QUADRANT_SIZE = { width: QUADRANT_PLOT.x + QUADRANT_PLOT.w + 14, height: QUADRANT_PLOT.y + QUADRANT_PLOT.h + 50 }

function open(width: number, height: number, p: Palette, text: SvgText): string[] {
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(width)}" height="${num(height)}" viewBox="0 0 ${num(width)} ${num(height)}" font-family="${esc(p.fontFamily)}" font-size="${FONT_SIZE}">`,
  ]
  if (text.title) out.push(`<title>${esc(text.title)}</title>`)
  if (text.description) out.push(`<desc>${esc(text.description)}</desc>`)
  out.push(`<rect width="${num(width)}" height="${num(height)}" fill="${p.surface}"/>`)
  return out
}

const tint = (p: Palette, i: number) => p.sections[i] || p.node

/** How the view draws a matrix: a point ringed as selected, and wider targets for the pointer. */
export interface MatrixDrawOptions {
  selected?: number | null
  /** A transparent ring around each point, easier to take with the pointer than the dot. */
  hit?: boolean
}

function quadrantSvg(m: MatrixSpec, p: Palette, text: SvgText, opts: MatrixDrawOptions): string {
  const selected = opts.selected ?? null
  const { x: x0, y: y0, w, h } = QUADRANT_PLOT
  const out = open(QUADRANT_SIZE.width, QUADRANT_SIZE.height, p, text)
  const [tl = '', tr = '', bl = '', br = ''] = m.quadrants
  const quads: [number, number, string][] = [
    [x0, y0, tl],
    [x0 + w / 2, y0, tr],
    [x0, y0 + h / 2, bl],
    [x0 + w / 2, y0 + h / 2, br],
  ]
  quads.forEach(([x, y, label], i) => {
    out.push(`<rect x="${num(x)}" y="${num(y)}" width="${num(w / 2)}" height="${num(h / 2)}" fill="${tint(p, i)}" stroke="${p.border}"/>`)
    if (label) {
      out.push(
        `<text x="${num(x + w / 4)}" y="${num(y + 22)}" text-anchor="middle" font-weight="600" fill="${p.muted}">${esc(label)}</text>`,
      )
    }
  })
  // The axes: low and high at the ends, the name in the middle.
  const ax = m.x
  const ay = m.y
  const below = y0 + h + 18
  if (ax) {
    if (ax.low) out.push(`<text x="${num(x0)}" y="${num(below)}" fill="${p.muted}">${esc(ax.low)}</text>`)
    if (ax.high) out.push(`<text x="${num(x0 + w)}" y="${num(below)}" text-anchor="end" fill="${p.muted}">${esc(ax.high)}</text>`)
    if (ax.label) {
      out.push(`<text x="${num(x0 + w / 2)}" y="${num(below + 20)}" text-anchor="middle" font-weight="600" fill="${p.text}">${esc(ax.label)} →</text>`)
    }
  }
  if (ay) {
    const side = (x: number, y: number, anchor: string, s: string, bold = false) =>
      `<text transform="translate(${num(x)} ${num(y)}) rotate(-90)" text-anchor="${anchor}"${bold ? ' font-weight="600"' : ''} fill="${bold ? p.text : p.muted}">${esc(s)}</text>`
    if (ay.low) out.push(side(x0 - 10, y0 + h, 'start', ay.low))
    if (ay.high) out.push(side(x0 - 10, y0, 'end', ay.high))
    if (ay.label) out.push(side(x0 - 30, y0 + h / 2, 'middle', `${ay.label} →`, true))
  }
  m.items.forEach((it, i) => {
    const cx = x0 + it.x * w
    const cy = y0 + (1 - it.y) * h
    const left = it.x > 0.72
    const color = it.link ? p.accent : p.text
    const ring = selected === i ? ` stroke="${p.accent}" stroke-width="3"` : ` stroke="${p.surface}" stroke-width="1.5"`
    out.push(
      `<g class="pd-matrix__item" data-item="${i}">` +
        (opts.hit ? `<circle cx="${num(cx)}" cy="${num(cy)}" r="18" fill="${p.accent}" fill-opacity="0"/>` : '') +
        `<circle cx="${num(cx)}" cy="${num(cy)}" r="7" fill="${p.accent}"${ring}/>` +
        `<text x="${num(left ? cx - 12 : cx + 12)}" y="${num(cy + 4)}"${left ? ' text-anchor="end"' : ''} font-size="12" fill="${color}"${it.link ? ' text-decoration="underline"' : ''}>${esc(it.label)}</text>` +
        '</g>',
    )
  })
  out.push('</svg>')
  return out.join('\n') + '\n'
}

const CELL_PAD = 12

function gridSvg(m: MatrixSpec, p: Palette, text: SvgText, measure: Measure): string {
  const wrap = (s: string) => (s === '' ? [] : wrapLabel(s, measure))
  const width = (lines: string[]) => Math.max(0, ...lines.map(measure))
  const head = m.rows.map(wrap)
  const cols = m.columns.map(wrap)
  const cells = m.rows.map((_, i) => m.columns.map((_, j) => wrap(m.cells[i]?.[j] ?? '')))
  const clamp = (v: number) => Math.min(224, Math.max(96, Math.ceil(v) + 2 * CELL_PAD))
  const w0 = clamp(Math.max(0, ...head.map(width)))
  const ws = m.columns.map((_, j) => clamp(Math.max(width(cols[j]!), ...cells.map((r) => width(r[j]!)))))
  const rowH = (lines: string[][]) => Math.max(40, Math.max(1, ...lines.map((l) => l.length)) * LINE_HEIGHT + 2 * CELL_PAD - 6)
  const h0 = rowH(cols)
  const hs = m.rows.map((_, i) => rowH([head[i]!, ...cells[i]!]))
  const W = w0 + ws.reduce((a, b) => a + b, 0) + 2
  const H = h0 + hs.reduce((a, b) => a + b, 0) + 2
  const out = open(W, H, p, text)
  const cell = (x: number, y: number, cw: number, ch: number, lines: string[], fill: string, bold: boolean) => {
    const top = y + (ch - lines.length * LINE_HEIGHT) / 2
    const spans = lines
      .map((l, k) => `<tspan x="${num(x + cw / 2)}" y="${num(top + LINE_HEIGHT * (k + 0.72))}">${esc(l)}</tspan>`)
      .join('')
    out.push(
      `<rect x="${num(x)}" y="${num(y)}" width="${num(cw)}" height="${num(ch)}" fill="${fill}" stroke="${p.border}"/>` +
        (spans ? `<text text-anchor="middle"${bold ? ' font-weight="600"' : ''} fill="${p.text}">${spans}</text>` : ''),
    )
  }
  let x = 1 + w0
  m.columns.forEach((_, j) => {
    cell(x, 1, ws[j]!, h0, cols[j]!, p.group, true)
    x += ws[j]!
  })
  let y = 1 + h0
  m.rows.forEach((_, i) => {
    cell(1, y, w0, hs[i]!, head[i]!, p.group, true)
    let cx = 1 + w0
    m.columns.forEach((_, j) => {
      cell(cx, y, ws[j]!, hs[i]!, cells[i]![j]!, m.rows.length === 2 && m.columns.length === 2 ? tint(p, i * 2 + j) : p.node, false)
      cx += ws[j]!
    })
    y += hs[i]!
  })
  out.push('</svg>')
  return out.join('\n') + '\n'
}

/** The SVG of a matrix: its quadrants and points, or its grid. */
export function matrixToSVG(m: MatrixSpec, p: Palette, measure: Measure, text: SvgText = {}, opts: MatrixDrawOptions = {}): string {
  return m.rows.length > 0 ? gridSvg(m, p, text, measure) : quadrantSvg(m, p, text, opts)
}
