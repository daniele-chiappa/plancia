import type { Diagram } from '../model/types'
import { diagramText } from '../model/text'
import { flowGraph, treeGraph } from '../layout/graph'
import { layoutGraph } from '../layout/layout'
import { createMeasure } from '../layout/shapes'
import { toMermaid } from '../mermaid/convert'
import { renderMermaid } from '../mermaid/render'
import { readPalette } from '../theme'
import { flowToSVG } from './flowSvg'
import { matrixToSVG } from './matrixSvg'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * A diagram's drawing as an SVG file, as the view exports it, with no view
 * on the page: in the colours of the page at `at` (its --plancia-* there),
 * its title and its text as the SVG's title and description. Mermaid's
 * kinds load Mermaid. Null when there is nothing to draw.
 */
export async function diagramToSVG(d: Diagram, at: Element | null = null): Promise<string | null> {
  const palette = readPalette(at)
  const measure = createMeasure(palette.fontFamily)
  const text = { title: d.title, description: diagramText(d) }
  if (d.kind === 'flow' || d.kind === 'tree') {
    const g = d.kind === 'flow' ? flowGraph(d) : treeGraph(d)
    if (!g.nodes.length) return null
    return flowToSVG(layoutGraph(g, measure, d.layout ?? {}), palette, text, d.kind === 'tree')
  }
  if (d.kind === 'matrix') return d.matrix ? matrixToSVG(d.matrix, palette, measure, text) : null
  const source = toMermaid(d, { title: false })
  if (!source) return null
  const svg = await renderMermaid(source, palette)
  const meta = (text.title ? `<title>${esc(text.title)}</title>` : '') + `<desc>${esc(text.description)}</desc>`
  return svg.replace(/<svg\b[^>]*>/, (open) => open + meta) + '\n'
}
