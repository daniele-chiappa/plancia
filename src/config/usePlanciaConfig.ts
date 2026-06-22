/**
 * Config injection contract + theme helpers. The provider supplies a reactive
 * PlanciaConfig; components read it as a fallback for unset props/labels
 * (precedence: explicit prop › config › built-in). Pinia-free (ADR-002/ADR-003).
 */
import { inject, type ComputedRef, type InjectionKey } from 'vue'
import type { PlanciaConfig } from './types'

export const PLANCIA_CONFIG: InjectionKey<ComputedRef<PlanciaConfig>> = Symbol('plancia.config')

/** Read the enclosing config (reactive), or `null` outside a provider. */
export function usePlanciaConfig(): ComputedRef<PlanciaConfig> | null {
  return inject(PLANCIA_CONFIG, null)
}

function withDashes(key: string): string {
  return key.startsWith('--') ? key : `--${key}`
}

/** Turn a theme map into a `:style`-ready object (`{ '--plancia-x': v }`). */
export function themeToStyle(theme?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  if (theme) for (const [k, v] of Object.entries(theme)) out[withDashes(k)] = v
  return out
}

/** Generate a CSS rule block from a theme map (export-to-CSS for a static file). */
export function themeToCss(theme: Record<string, string>, selector = ':root'): string {
  const body = Object.entries(theme)
    .map(([k, v]) => `  ${withDashes(k)}: ${v};`)
    .join('\n')
  return `${selector} {\n${body}\n}\n`
}

/** Imperatively apply a theme to an element (default: the document root). */
export function applyTheme(theme: Record<string, string>, target?: HTMLElement): void {
  const el = target ?? (typeof document !== 'undefined' ? document.documentElement : null)
  if (!el) return
  for (const [k, v] of Object.entries(theme)) el.style.setProperty(withDashes(k), v)
}
