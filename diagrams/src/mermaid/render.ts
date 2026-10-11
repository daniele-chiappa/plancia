import type { Palette } from '../theme'

// Mermaid, loaded the first time a diagram needs it. Its configuration is
// global, so renders run one at a time, each with the colours of its own
// place on the page.

type MermaidApi = typeof import('mermaid').default

let api: Promise<MermaidApi> | null = null
let queue: Promise<unknown> = Promise.resolve()
let seq = 0

function load(): Promise<MermaidApi> {
  api ??= import('mermaid').then((m) => m.default)
  return api
}

function themeVariables(p: Palette): Record<string, string | boolean> {
  return {
    darkMode: p.dark,
    background: p.surface,
    fontFamily: p.fontFamily,
    fontSize: '13px',
    primaryColor: p.node,
    primaryTextColor: p.text,
    primaryBorderColor: p.border,
    secondaryColor: p.accentSoft,
    tertiaryColor: p.surface,
    lineColor: p.edge,
    textColor: p.text,
    mainBkg: p.node,
    nodeBorder: p.border,
    // The root and the branches of a mind map, a colour each.
    git0: p.accentSoft,
    gitBranchLabel0: p.text,
    ...Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [
        [`cScale${i}`, p.sections[i % Math.max(1, p.sections.length)] ?? p.node],
        [`cScaleLabel${i}`, p.text],
      ]).flat(),
    ),
  }
}

/**
 * Draws Mermaid source as an SVG string, with the palette given. Strict
 * security: labels sanitised by Mermaid, no click handlers, no scripts.
 */
export function renderMermaid(source: string, palette: Palette): Promise<string> {
  const run = async () => {
    const mermaid = await load()
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      themeVariables: themeVariables(palette),
    })
    const { svg } = await mermaid.render(`plancia-diagram-m${seq++}`, source)
    return svg
  }
  const next = queue.then(run, run)
  queue = next.catch(() => undefined)
  return next
}
