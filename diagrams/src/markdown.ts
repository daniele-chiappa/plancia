// The diagram blocks of a markdown note, found as gosidian's server finds
// them (parser.FindFenced): a fence opened by ``` or ~~~ (three or more, at
// most three spaces in), closed by a line of the same character, at least
// as long, with no info string; a block inside another fence (a code sample
// that shows one) is not a block, and a fence never closed is none.

/** A diagram block of a markdown text. Offsets are in characters of the text. */
export interface MarkdownDiagramBlock {
  /** The opening fence's first character, and just past the closing line. */
  start: number
  end: number
  /** The YAML: from the line after the opening fence to the closing fence. */
  contentStart: number
  contentEnd: number
  source: string
  /** The 1-based line of the opening fence. */
  line: number
}

// Go's RE2 \s is ASCII whitespace; so is this one.
const fenceRe = /^ {0,3}(`{3,}|~{3,})[\t\n\f\r ]*([^`\t\n\f\r ]*)/

/** The blocks of markdown whose info string is lang (default "diagram"), in order. */
export function findDiagramBlocks(markdown: string, lang = 'diagram'): MarkdownDiagramBlock[] {
  const out: MarkdownDiagramBlock[] = []
  let fence = ''
  let cur: { start: number; contentStart: number; line: number } | null = null
  let off = 0
  let lineNo = 1
  while (off < markdown.length) {
    const nl = markdown.indexOf('\n', off)
    const end = nl < 0 ? markdown.length : nl + 1
    const line = markdown.slice(off, end).replace(/[\r\n]+$/, '')
    const m = fenceRe.exec(line)
    if (fence === '' && m) {
      fence = m[1]!
      if (m[2] === lang) cur = { start: off, contentStart: end, line: lineNo }
    } else if (fence !== '' && m && m[2] === '' && m[1]!.startsWith(fence[0]!) && m[1]!.length >= fence.length) {
      if (cur) {
        out.push({
          start: cur.start,
          end,
          contentStart: cur.contentStart,
          contentEnd: off,
          source: markdown.slice(cur.contentStart, off),
          line: cur.line,
        })
        cur = null
      }
      fence = ''
    }
    off = end
    lineNo++
  }
  return out
}

/**
 * markdown with the YAML of one of its blocks replaced, the fences and the
 * rest of the text untouched. The new YAML ends with a line break, so the
 * closing fence keeps its own line.
 */
export function replaceDiagramBlock(markdown: string, block: MarkdownDiagramBlock, source: string): string {
  const yaml = source === '' || source.endsWith('\n') ? source : `${source}\n`
  return markdown.slice(0, block.contentStart) + yaml + markdown.slice(block.contentEnd)
}
