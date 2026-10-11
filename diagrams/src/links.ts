/** A link of a diagram, as the consumer receives it. */
export interface DiagramLinkEvent {
  /** A note's path (with its #heading, without the alias), or the address. */
  target: string
  kind: 'note' | 'url'
  /** The label of the element the link is on. */
  label: string
}

/**
 * What a link of the format points at: a [[note#Heading|text]] gives the
 * note and its heading, an address gives itself; null for anything else.
 */
export function linkTarget(link: string, label = ''): DiagramLinkEvent | null {
  const l = link.trim()
  if (/^https?:\/\//.test(l)) return { target: l, kind: 'url', label }
  const m = /^\[\[([^\]]+)\]\]$/.exec(l)
  if (!m) return null
  const target = m[1]!.replace(/\\\|/g, '|').split('|')[0]!.trim()
  return target ? { target, kind: 'note', label } : null
}
