import { describe, expect, it } from 'vitest'
import { parseThemeManifest } from './manifest'

const css = `:root {
  /* example in a comment: --plancia-accent: var(--color-blue-600) — must be ignored */
  --plancia-w-s: 32rem;
  --plancia-surface: #ffffff;
  --plancia-accent: #3b82f6;
  --plancia-accent-soft: color-mix(in srgb, var(--plancia-accent) 14%, transparent);
  --plancia-sidebar-bg: var(--plancia-surface);
  --plancia-sidebar-z: 40;
  --plancia-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  --plancia-dialog-transition: 160ms;
}
.plancia { color: red; }`

const index = () => Object.fromEntries(parseThemeManifest(css).map((k) => [k.name, k]))

describe('parseThemeManifest', () => {
  it('extracts knobs from the :root block only', () => {
    const knobs = parseThemeManifest(css)
    expect(knobs.map((k) => k.name)).toContain('--plancia-accent')
    expect(knobs).toHaveLength(8)
  })

  it('infers types from literal values', () => {
    const by = index()
    expect(by['--plancia-surface']!.type).toBe('color')
    expect(by['--plancia-w-s']!.type).toBe('length')
    expect(by['--plancia-sidebar-z']!.type).toBe('number')
    expect(by['--plancia-shadow']!.type).toBe('shadow')
    expect(by['--plancia-dialog-transition']!.type).toBe('text')
  })

  it('flags derived (var/color-mix) values and types them by name', () => {
    const by = index()
    expect(by['--plancia-accent-soft']!.derived).toBe(true)
    expect(by['--plancia-accent-soft']!.type).toBe('color')
    expect(by['--plancia-sidebar-bg']!.derived).toBe(true)
    expect(by['--plancia-sidebar-bg']!.type).toBe('color')
    expect(by['--plancia-surface']!.derived).toBe(false)
  })

  it('groups by family', () => {
    const by = index()
    expect(by['--plancia-accent']!.group).toBe('base')
    expect(by['--plancia-w-s']!.group).toBe('window')
    expect(by['--plancia-sidebar-bg']!.group).toBe('sidebar')
    expect(by['--plancia-dialog-transition']!.group).toBe('dialog')
  })

  it('returns [] when there is no :root', () => {
    expect(parseThemeManifest('.x { color: red }')).toEqual([])
  })
})
