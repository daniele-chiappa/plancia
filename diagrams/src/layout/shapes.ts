import type { NodeShape } from '../model/types'

// The geometry of a node: its label cut into lines, its size from them, and
// the outline of its shape. The view and the SVG export share it, so they
// draw the same thing.

/** The type of the labels, in px: the CSS of the package uses the same. */
export const FONT_SIZE = 13
export const LINE_HEIGHT = 18
/** A label longer than this wraps. */
export const MAX_LABEL_WIDTH = 200
const PAD_X = 14
const PAD_Y = 9
const MIN_W = 64
const MIN_H = 36

/** How wide a text is, in px, at FONT_SIZE. */
export type Measure = (text: string) => number

/**
 * A measure with the font given (a CSS font family), on a canvas when the
 * page has one, else an estimate from the number of characters: a test
 * without a canvas still lays out, a little wider or narrower.
 */
export function createMeasure(fontFamily = 'sans-serif'): Measure {
  let ctx: CanvasRenderingContext2D | null = null
  try {
    if (typeof document !== 'undefined' && !/jsdom/i.test(globalThis.navigator?.userAgent ?? '')) {
      ctx = document.createElement('canvas').getContext('2d')
    }
  } catch {
    ctx = null
  }
  if (ctx) {
    ctx.font = `${FONT_SIZE}px ${fontFamily}`
    const c = ctx
    return (text) => c.measureText(text).width
  }
  return (text) => text.length * FONT_SIZE * 0.58
}

/** A label in lines of at most MAX_LABEL_WIDTH px; a word longer than that keeps its line. */
export function wrapLabel(label: string, measure: Measure): string[] {
  const out: string[] = []
  for (const para of label.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line === '' ? word : `${line} ${word}`
      if (line !== '' && measure(next) > MAX_LABEL_WIDTH) {
        out.push(line)
        line = word
      } else {
        line = next
      }
    }
    out.push(line)
  }
  return out
}

export interface NodeBox {
  lines: string[]
  w: number
  h: number
}

/** The size of a node of a shape around its label's lines. */
export function nodeSize(shape: NodeShape, lines: string[], measure: Measure): NodeBox {
  const textW = Math.max(0, ...lines.map(measure))
  const textH = lines.length * LINE_HEIGHT
  let w = Math.max(MIN_W, textW + 2 * PAD_X)
  let h = Math.max(MIN_H, textH + 2 * PAD_Y)
  switch (shape) {
    case 'decision':
      // A rhombus holds a box of half its width and half its height.
      w = Math.max(96, 2 * (textW + 12))
      h = Math.max(52, 2 * (textH + 6))
      break
    case 'circle':
      w = h = Math.max(MIN_H + 12, Math.hypot(textW + 2 * PAD_X, textH + 2 * PAD_Y))
      break
    case 'data':
      w += 2 * skew(h)
      break
    case 'doc':
      h += 8
      break
    case 'db':
      h += 2 * DB_RY
      break
  }
  return { lines, w: Math.ceil(w), h: Math.ceil(h) }
}

const DB_RY = 7
const FOLD = 10

function skew(h: number): number {
  return Math.round(h * 0.3)
}

const f = (n: number) => String(Math.round(n * 10) / 10)

/**
 * The outline of a shape in a box of w × h with its corner at 0,0, as SVG
 * path data: the first path is filled, the second (when there is one) is a
 * line on it (a cylinder's rim, a note's fold).
 */
export function shapePaths(shape: NodeShape, w: number, h: number): [string, string?] {
  switch (shape) {
    case 'pill': {
      const r = h / 2
      return [`M${f(r)} 0H${f(w - r)}A${f(r)} ${f(r)} 0 0 1 ${f(w - r)} ${f(h)}H${f(r)}A${f(r)} ${f(r)} 0 0 1 ${f(r)} 0Z`]
    }
    case 'decision':
      return [`M${f(w / 2)} 0L${f(w)} ${f(h / 2)}L${f(w / 2)} ${f(h)}L0 ${f(h / 2)}Z`]
    case 'data': {
      const s = skew(h)
      return [`M${f(s)} 0H${f(w)}L${f(w - s)} ${f(h)}H0Z`]
    }
    case 'doc': {
      const wave = 8
      return [
        `M0 0H${f(w)}V${f(h - wave)}C${f(w * 0.75)} ${f(h - 2 * wave)} ${f(w * 0.25)} ${f(h + wave * 0.6)} 0 ${f(h - wave)}Z`,
      ]
    }
    case 'db': {
      const rx = w / 2
      return [
        `M0 ${f(DB_RY)}A${f(rx)} ${DB_RY} 0 0 1 ${f(w)} ${f(DB_RY)}V${f(h - DB_RY)}A${f(rx)} ${DB_RY} 0 0 1 0 ${f(h - DB_RY)}Z`,
        `M0 ${f(DB_RY)}A${f(rx)} ${DB_RY} 0 0 0 ${f(w)} ${f(DB_RY)}`,
      ]
    }
    case 'circle': {
      const r = w / 2
      return [`M0 ${f(r)}A${f(r)} ${f(r)} 0 1 1 ${f(w)} ${f(r)}A${f(r)} ${f(r)} 0 1 1 0 ${f(r)}Z`]
    }
    case 'note':
      return [
        `M0 0H${f(w - FOLD)}L${f(w)} ${FOLD}V${f(h)}H0Z`,
        `M${f(w - FOLD)} 0V${FOLD}H${f(w)}`,
      ]
    default: {
      const r = 6
      return [
        `M${r} 0H${f(w - r)}Q${f(w)} 0 ${f(w)} ${r}V${f(h - r)}Q${f(w)} ${f(h)} ${f(w - r)} ${f(h)}H${r}Q0 ${f(h)} 0 ${f(h - r)}V${r}Q0 0 ${r} 0Z`,
      ]
    }
  }
}

/** The vertical offset of a shape's label block, from the top of its box. */
export function labelTop(shape: NodeShape, h: number, lines: number): number {
  const block = lines * LINE_HEIGHT
  let top = (h - block) / 2
  if (shape === 'db') top += DB_RY / 2
  if (shape === 'doc') top -= 3
  return top
}
