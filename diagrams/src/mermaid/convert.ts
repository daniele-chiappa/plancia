import type { Diagram, DiagramBranch } from '../model/types'

// A diagram as Mermaid source, for the kinds Mermaid draws here: the mind
// map (mindmap) and the fishbone (ishikawa). The YAML stays the source;
// this is a conversion, like the export Obsidian will get later.

/** The kinds this package draws with Mermaid. */
export const MERMAID_KINDS = ['mindmap', 'fishbone'] as const

/**
 * A label as Mermaid text: one line, its quotes and the characters Mermaid
 * reads as markup written as entities. `$` too, so that no label ever
 * reaches Mermaid's maths (KaTeX).
 */
export function mermaidText(label: string): string {
  return label
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/#/g, '#35;')
    .replace(/"/g, '#quot;')
    .replace(/\$/g, '#36;')
    .replace(/`/g, '#96;')
}

/** Mermaid source for a mind map or a fishbone; '' for the other kinds. */
export function toMermaid(d: Diagram): string {
  if (!d.root) return ''
  if (d.kind === 'mindmap') {
    const lines = ['mindmap']
    let seq = 0
    const walk = (b: DiagramBranch, depth: number) => {
      const id = `n${seq++}`
      const text = `"${mermaidText(b.label)}"`
      lines.push(`${'  '.repeat(depth + 1)}${id}${depth === 0 ? `((${text}))` : `[${text}]`}`)
      for (const c of b.children) walk(c, depth + 1)
    }
    walk(d.root, 0)
    return lines.join('\n') + '\n'
  }
  if (d.kind === 'fishbone') {
    // ishikawa reads a line per node, its depth from the indent: the first
    // is the effect, then the categories, then the causes. A line is plain
    // text, so only the comment mark %% and line breaks need care.
    const lines = ['ishikawa']
    const walk = (b: DiagramBranch, depth: number) => {
      const text = b.label.replace(/\s+/g, ' ').trim().replace(/^%%/, '% %')
      lines.push(`${'    '.repeat(depth + 1)}${text || '…'}`)
      for (const c of b.children) walk(c, depth + 1)
    }
    walk(d.root, 0)
    return lines.join('\n') + '\n'
  }
  return ''
}
