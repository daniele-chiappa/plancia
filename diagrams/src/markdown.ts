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

// --- the twin ---
//
// A note's diagram may keep a twin for other apps (Obsidian draws Mermaid,
// not this format): a ```mermaid block right after the diagram's, nothing
// but blank lines between, whose first line is the mark with the hash of
// the YAML it was made from. gosidian hides it, and its lint says when a
// diagram changed without its twin.

/** The first line of a twin, before the hash. */
export const TWIN_MARK = '%% diagram-twin'

/**
 * The hash of a diagram's YAML, as the twin's mark holds it: FNV-1a, 32
 * bits, over the UTF-8 of the YAML with its line ends made \n and its
 * trailing ASCII white space left out; 8 hex digits. gosidian's server makes the
 * same one.
 */
export function diagramHash(source: string): string {
  const bytes = new TextEncoder().encode(source.replace(/\r\n?/g, '\n').replace(/[ \t\n\r\f\v]+$/, ''))
  let h = 0x811c9dc5
  for (const b of bytes) {
    h ^= b
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** The hash in a twin's mark, or null when the Mermaid is no twin. */
export function twinHash(mermaid: string): string | null {
  const m = /^%% diagram-twin ([0-9a-f]{8})\b/.exec(mermaid)
  return m ? m[1]! : null
}

/** The twin of a diagram block: the ```mermaid block after it, or null. */
export function findTwin(markdown: string, block: MarkdownDiagramBlock): MarkdownDiagramBlock | null {
  for (const m of findDiagramBlocks(markdown, 'mermaid')) {
    if (m.start < block.end) continue
    if (markdown.slice(block.end, m.start).trim() !== '') return null
    return twinHash(m.source) !== null ? m : null
  }
  return null
}

/** A twin's text: the mark with the YAML's hash, then the Mermaid. */
export function twinText(yaml: string, mermaid: string): string {
  return `${TWIN_MARK} ${diagramHash(yaml)} — made from the diagram above: change that one\n${mermaid}`
}

/**
 * markdown with a diagram block's YAML replaced, and its twin made, written
 * again or taken away. `twin` is the twin's Mermaid (twinText makes it from
 * the YAML), or null to take it away; undefined keeps a twin there as it
 * is (the caller writes it again when the YAML changed).
 */
export function writeDiagramBlock(
  markdown: string,
  block: MarkdownDiagramBlock,
  source: string,
  twin?: string | null,
): string {
  const old = findTwin(markdown, block)
  const yaml = source === '' || source.endsWith('\n') ? source : `${source}\n`
  let text = markdown.slice(0, block.contentStart) + yaml + markdown.slice(block.contentEnd)
  if (twin === undefined) return text
  const shift = yaml.length - (block.contentEnd - block.contentStart)
  const end = block.end + shift
  if (old) {
    // The twin and the blank lines before it go; a new one takes their place.
    text = text.slice(0, end) + text.slice(old.end + shift)
  }
  if (twin === null) return text
  const body = twin.endsWith('\n') ? twin : `${twin}\n`
  const before = text.slice(0, end)
  const after = text.slice(end)
  const lead = before.endsWith('\n') ? '\n' : '\n\n'
  const tail = after === '' || after.startsWith('\n') ? '' : '\n'
  return `${before}${lead}\`\`\`mermaid\n${body}\`\`\`\n${tail}${after}`
}
