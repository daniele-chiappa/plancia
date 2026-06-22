/**
 * Hand-written manifest of the configurable BEHAVIOR knobs (the appearance knobs
 * are auto-derived from style.css via parseThemeManifest). Mirrors the
 * `*ConfigDefaults` types; drives the configurator's behavior controls.
 */
export interface BehaviorKnob {
  family: 'window' | 'sidebar' | 'dialog'
  /** Key inside `components.<family>.defaults`. */
  key: string
  label: string
  type: 'select' | 'boolean' | 'number'
  options?: string[]
  default: string | number | boolean
}

export const behaviorManifest: BehaviorKnob[] = [
  { family: 'window', key: 'defaultWidth', label: 'Default window width', type: 'select', options: ['s', 'm', 'full'], default: 'm' },
  { family: 'sidebar', key: 'mode', label: 'Sidebar mode', type: 'select', options: ['inline', 'overlay', 'floating'], default: 'inline' },
  { family: 'sidebar', key: 'defaultState', label: 'Sidebar default state', type: 'select', options: ['expanded', 'collapsed', 'closed'], default: 'expanded' },
  { family: 'sidebar', key: 'responsive', label: 'Sidebar responsive breakpoint (px, 0 = off)', type: 'number', default: 0 },
  { family: 'dialog', key: 'closeOnEsc', label: 'Dialog: close on Esc', type: 'boolean', default: true },
  { family: 'dialog', key: 'closeOnBackdrop', label: 'Dialog: close on backdrop', type: 'boolean', default: true },
]
