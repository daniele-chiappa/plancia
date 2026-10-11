// The colours of a diagram come from CSS variables (style.css), which take
// plancia's --plancia-* when the page has them. The view uses the variables
// as they are; Mermaid and the SVG export need plain colours, read here
// from the page at the place of the diagram.

export interface Palette {
  dark: boolean
  surface: string
  node: string
  text: string
  muted: string
  border: string
  accent: string
  accentSoft: string
  edge: string
  group: string
  user: string
  data: string
  ext: string
  /** One colour per branch of a mind map, from fixed hues on the surface. */
  sections: string[]
  /** The fixed hues themselves (the accent first), for lines and the sets of a Venn. */
  hues: string[]
  /** A critical task: its line, and its fill on the surface. */
  critical: string
  criticalSoft: string
  fontFamily: string
}

/** The palette when the page gives none (a test, a page without the CSS). */
export const DEFAULT_PALETTE: Palette = {
  dark: false,
  surface: '#ffffff',
  node: '#f6f8fa',
  text: '#1f2328',
  muted: '#59636e',
  border: '#d0d7de',
  accent: '#3b82f6',
  accentSoft: '#e3edfd',
  edge: '#59636e',
  group: '#f6f8fa',
  user: '#e3edfd',
  data: '#e6f4ea',
  ext: '#f1ebfb',
  sections: [],
  hues: ['#3b82f6', '#1a7f37', '#8250df', '#bc4c00', '#0f766e', '#bf3989'],
  critical: '#cf222e',
  criticalSoft: '#f5d3d5',
  fontFamily: 'system-ui, sans-serif',
}

/** The hues of a mind map's branches: the accent, then green, purple, orange, teal, pink. */
const SECTION_HUES = ['', '#1a7f37', '#8250df', '#bc4c00', '#0f766e', '#bf3989']

/** a mixed into b, share of a from 0 to 1, both #rrggbb. */
function mix(a: string, b: string, share: number): string {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) return b
  const [x, y] = [rgb(a), rgb(b)]
  return `#${x.map((v, i) => hex2(Math.round(v * share + y[i]! * (1 - share)))).join('')}`
}

const VARS: Record<Exclude<keyof Palette, 'dark' | 'fontFamily' | 'sections' | 'hues' | 'critical' | 'criticalSoft'>, string> = {
  surface: '--pd-surface',
  node: '--pd-node',
  text: '--pd-text',
  muted: '--pd-muted',
  border: '--pd-border',
  accent: '--pd-accent',
  accentSoft: '--pd-accent-soft',
  edge: '--pd-edge',
  group: '--pd-group',
  user: '--pd-user',
  data: '--pd-data',
  ext: '--pd-ext',
}

let canvas: CanvasRenderingContext2D | null | undefined

const hex2 = (n: number) => n.toString(16).padStart(2, '0')

/**
 * A CSS colour as #rrggbb, or rgba() when it is see-through: the forms
 * every renderer reads ('' when it is no colour). The page may give any
 * CSS colour, and a color-mix() comes back from getComputedStyle as
 * color(srgb …), which Mermaid does not read: the colour is painted on a
 * pixel of a canvas, and the pixel read back.
 */
function normalise(color: string): string {
  if (canvas === undefined) {
    try {
      canvas = /jsdom/i.test(globalThis.navigator?.userAgent ?? '')
        ? null
        : document.createElement('canvas').getContext('2d', { willReadFrequently: true })
    } catch {
      canvas = null
    }
  }
  if (!color) return ''
  if (!canvas) return /^#|^rgba?\(/.test(color) ? color : ''
  canvas.canvas.width = canvas.canvas.height = 1
  canvas.clearRect(0, 0, 1, 1)
  canvas.fillStyle = '#000'
  canvas.fillStyle = color
  canvas.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = canvas.getImageData(0, 0, 1, 1).data
  if (a === 255) return `#${hex2(r!)}${hex2(g!)}${hex2(b!)}`
  return `rgba(${r}, ${g}, ${b}, ${Math.round((a! / 255) * 1000) / 1000})`
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex)
  if (!m) return 1
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h!, 16) / 255)
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

/** The palette at an element of the page: the variables there, resolved. */
export function readPalette(el: Element | null): Palette {
  if (!el || typeof getComputedStyle !== 'function') return { ...DEFAULT_PALETTE }
  const probe = document.createElement('span')
  probe.style.display = 'none'
  el.appendChild(probe)
  const out: Palette = { ...DEFAULT_PALETTE }
  try {
    for (const [key, name] of Object.entries(VARS) as [keyof typeof VARS, string][]) {
      probe.style.color = `var(${name})`
      const c = normalise(getComputedStyle(probe).color)
      if (c) out[key] = c
    }
    const font = getComputedStyle(el).fontFamily
    if (font) out.fontFamily = font
  } finally {
    probe.remove()
  }
  out.dark = luminance(out.surface) < 0.5
  out.sections = SECTION_HUES.map((h) => mix(h || out.accent, out.surface, out.dark ? 0.32 : 0.2))
  // On a dark surface the hues are lighter, so lines and text stand out.
  out.hues = SECTION_HUES.map((h) => (out.dark && h ? mix(h, '#ffffff', 0.7) : h || out.accent))
  out.critical = out.dark ? '#ff8182' : '#cf222e'
  out.criticalSoft = mix(out.critical, out.surface, out.dark ? 0.35 : 0.2)
  return out
}
