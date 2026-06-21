import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWindowsStore } from './windows'

beforeEach(() => setActivePinia(createPinia()))

describe('windows store', () => {
  it('opens a window and focuses it', () => {
    const s = useWindowsStore()
    const id = s.open({ type: 'note', key: 'note:a', title: 'A' })
    expect(s.windows).toHaveLength(1)
    expect(s.focusedId).toBe(id)
    expect(s.focused?.title).toBe('A')
    expect(s.focused?.width).toBe('m') // defaultWidth
  })

  it('de-dups by key and restores + focuses the existing window', () => {
    const s = useWindowsStore()
    const a = s.open({ type: 'note', key: 'k' })
    s.minimize(a)
    const again = s.open({ type: 'note', key: 'k' })
    expect(again).toBe(a)
    expect(s.windows).toHaveLength(1)
    expect(s.focusedId).toBe(a)
    expect(s._byId(a)?.minimized).toBe(false)
  })

  it('inserts a new window immediately to the right of the focused one', () => {
    const s = useWindowsStore()
    s.open({ type: 't', key: 'a' })
    s.open({ type: 't', key: 'b' }) // focus → b, order [a,b]
    const a = s.windows[0]!.id
    s.focus(a)
    s.open({ type: 't', key: 'c' }) // inserted right of a
    expect(s.windows.map((w) => w.key)).toEqual(['a', 'c', 'b'])
  })

  it('open with focus:false keeps the current focus', () => {
    const s = useWindowsStore()
    const a = s.open({ type: 't', key: 'a' })
    s.open({ type: 't', key: 'b', focus: false })
    expect(s.focusedId).toBe(a)
    expect(s.windows.map((w) => w.key)).toEqual(['a', 'b'])
  })

  it('cycleWidth follows the configured cycle', () => {
    const s = useWindowsStore()
    s.configure({ widthCycle: ['m', 'full', 's'], defaultWidth: 'm' })
    const a = s.open({ type: 't', key: 'a' })
    expect(s._byId(a)?.width).toBe('m')
    s.cycleWidth(a)
    expect(s._byId(a)?.width).toBe('full')
    s.cycleWidth(a)
    expect(s._byId(a)?.width).toBe('s')
    s.cycleWidth(a)
    expect(s._byId(a)?.width).toBe('m')
  })

  it('close re-focuses the neighbour at the same index', () => {
    const s = useWindowsStore()
    s.open({ type: 't', key: 'a' })
    const b = s.open({ type: 't', key: 'b' })
    const c = s.open({ type: 't', key: 'c' })
    s.focus(b)
    s.close(b)
    expect(s.windows.map((w) => w.key)).toEqual(['a', 'c'])
    expect(s.focusedId).toBe(c)
  })

  it('focusAdjacent clamps at the edges', () => {
    const s = useWindowsStore()
    const a = s.open({ type: 't', key: 'a' })
    const b = s.open({ type: 't', key: 'b' })
    s.focus(a)
    s.focusAdjacent(-1)
    expect(s.focusedId).toBe(a)
    s.focusAdjacent(1)
    expect(s.focusedId).toBe(b)
    s.focusAdjacent(1)
    expect(s.focusedId).toBe(b)
  })

  it('minimize moves focus to the last visible; restore re-focuses', () => {
    const s = useWindowsStore()
    const a = s.open({ type: 't', key: 'a' })
    const b = s.open({ type: 't', key: 'b' })
    s.focus(b)
    s.minimize(b)
    expect(s.minimizedList.map((w) => w.key)).toEqual(['b'])
    expect(s.focusedId).toBe(a)
    s.restore(b)
    expect(s.focusedId).toBe(b)
    expect(s._byId(b)?.minimized).toBe(false)
  })

  it('identify sets the key and merges props; setters update fields', () => {
    const s = useWindowsStore()
    const a = s.open({ type: 'note', key: 'note:auto', props: { draft: true } })
    s.identify(a, 'note:42', { id: 42 })
    expect(s._byId(a)?.key).toBe('note:42')
    expect(s._byId(a)?.props).toMatchObject({ draft: true, id: 42 })
    s.setTitle(a, 'X')
    s.setDirty(a, true)
    s.setTags(a, [{ label: 't' }])
    expect(s._byId(a)?.title).toBe('X')
    expect(s._byId(a)?.dirty).toBe(true)
    expect(s._byId(a)?.tags).toHaveLength(1)
  })

  it('touch bumps dataVersion; reset clears windows but keeps config', () => {
    const s = useWindowsStore()
    s.configure({ defaultWidth: 'full' })
    s.open({ type: 't', key: 'a' })
    s.touch()
    expect(s.dataVersion).toBe(1)
    s.reset()
    expect(s.windows).toHaveLength(0)
    expect(s.focusedId).toBeNull()
    expect(s.defaultWidth).toBe('full')
  })
})
