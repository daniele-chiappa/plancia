/**
 * Theme-knob manifest derived from the stylesheet. The configurator parses the
 * `:root` block of `plancia/style.css` (or any CSS string) to auto-generate
 * appearance controls — so adding a `--plancia-*` variable automatically extends
 * the configurator, with no hand-maintained list (ADR-003).
 */
export type ThemeKnobType = 'color' | 'length' | 'number' | 'shadow' | 'text'

export interface ThemeKnob {
  /** Custom-property name, e.g. `--plancia-accent`. */
  name: string
  /** Default value as written in the stylesheet. */
  default: string
  type: ThemeKnobType
  /** Family group derived from the name: `base | window | sidebar | dialog | tag`. */
  group: string
  /** True when the value references other tokens (`var()` / `color-mix()`), i.e. it
   *  is derived from the core rather than an editable literal. */
  derived: boolean
}

function groupOf(name: string): string {
  const first = name.replace(/^--plancia-/, '').split('-')[0]
  if (first === 'sidebar' || first === 'dialog' || first === 'tag') return first
  if (first === 'w') return 'window'
  return 'base'
}

const COLOR_VALUE = /^(#|rgb|hsl|oklch|oklab|color-mix)/i
const LENGTH_VALUE = /^-?[\d.]+(px|rem|em|vh|vw|%|ch)$/i
const NUMBER_VALUE = /^-?[\d.]+$/

/** Best-effort type from a literal value. */
function typeByValue(value: string): ThemeKnobType {
  const v = value.trim()
  // shadow: lengths + a color in one value (e.g. `0 1px 2px rgba(...)`)
  if (/\dpx/.test(v) && /(rgb|hsl|#|color-mix)/i.test(v)) return 'shadow'
  if (COLOR_VALUE.test(v) || v === 'transparent' || v === 'currentColor') return 'color'
  if (LENGTH_VALUE.test(v)) return 'length'
  if (NUMBER_VALUE.test(v)) return 'number'
  return 'text'
}

/** Type guess for derived values (`var()`), inferred from the token name. */
function typeByName(name: string): ThemeKnobType {
  if (/shadow/.test(name)) return 'shadow'
  if (/(bg|border|surface|accent|text|fg|danger|warning|backdrop|tag|on-accent)/.test(name))
    return 'color'
  if (/(size|width|rail|gap|radius|padding|^--plancia-w-)/.test(name)) return 'length'
  if (/-z$/.test(name)) return 'number'
  return 'text'
}

/** Strip CSS block comments with a linear indexOf scan. Any regex form (lazy
 *  or the textbook "unrolled" loop) trips CodeQL's js/polynomial-redos on
 *  adversarial input; indexOf is O(n) and unambiguous. An unterminated comment
 *  opener is left untouched. */
function stripCssComments(css: string): string {
  let out = ''
  let i = 0
  for (;;) {
    const start = css.indexOf('/*', i)
    if (start === -1) return out + css.slice(i)
    const end = css.indexOf('*/', start + 2)
    if (end === -1) return out + css.slice(i) // unterminated: leave as-is
    out += css.slice(i, start)
    i = end + 2
  }
}

// Anchored, single-quantifier → linear (not a ReDoS shape). Validates a knob name.
const KNOB_NAME = /^--plancia-[a-z0-9-]+$/i

/** Body of the first `:root { … }` block (up to its first `}`), or null.
 *  indexOf-based, not regex, so it can't be a ReDoS target. */
function extractRootBody(css: string): string | null {
  for (let from = 0; ; ) {
    const r = css.indexOf(':root', from)
    if (r === -1) return null
    let j = r + 5
    while (j < css.length && /\s/.test(css[j]!)) j++
    if (css[j] === '{') {
      const close = css.indexOf('}', j + 1)
      return close === -1 ? null : css.slice(j + 1, close)
    }
    from = r + 5
  }
}

/** Parse the first `:root { … }` block of a CSS string into theme knobs. */
export function parseThemeManifest(css: string): ThemeKnob[] {
  // Strip comments first — they may contain `--plancia-*: …` example text.
  const body = extractRootBody(stripCssComments(css))
  if (body === null) return []
  const knobs: ThemeKnob[] = []
  // Walk `;`-terminated declarations. The part after the last `;` is
  // unterminated → ignored (matches the old `[^;]+;` regex). Split on the
  // first `:` per declaration. No regex over the input → no ReDoS.
  const decls = body.split(';')
  for (let k = 0; k < decls.length - 1; k++) {
    const decl = decls[k]!
    const colon = decl.indexOf(':')
    if (colon === -1) continue
    const name = decl.slice(0, colon).trim()
    if (!KNOB_NAME.test(name)) continue
    const value = decl.slice(colon + 1).trim()
    const derived = /var\(|color-mix\(/.test(value)
    knobs.push({
      name,
      default: value,
      type: derived ? typeByName(name) : typeByValue(value),
      group: groupOf(name),
      derived,
    })
  }
  return knobs
}
