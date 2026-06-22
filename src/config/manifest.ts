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

/** Parse the first `:root { … }` block of a CSS string into theme knobs. */
export function parseThemeManifest(css: string): ThemeKnob[] {
  // Strip comments first — they may contain `--plancia-*: …` example text.
  const root = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/:root\s*\{([\s\S]*?)\}/)
  if (!root) return []
  const knobs: ThemeKnob[] = []
  const re = /(--plancia-[a-z0-9-]+)\s*:\s*([^;]+);/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(root[1]!)) !== null) {
    const name = m[1]!
    const value = m[2]!.trim()
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
