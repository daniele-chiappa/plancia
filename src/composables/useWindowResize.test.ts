import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import {
  useWindowResize,
  DEFAULT_MIN_WIDTH,
  DEFAULT_HARD_MAX_FACTOR,
} from './useWindowResize'

describe('useWindowResize', () => {
  it('defaults: min/maxVisible/hardMax and starting width', () => {
    const c = useWindowResize({ maxVisiblePx: 800, defaultPx: 400 })
    expect(c.minPx.value).toBe(DEFAULT_MIN_WIDTH)
    expect(c.maxVisiblePx.value).toBe(800)
    expect(c.hardMaxPx.value).toBe(800 * DEFAULT_HARD_MAX_FACTOR)
    expect(c.width.value).toBe(400)
    expect(c.phase.value).toBe('normal')
  })

  it('dragTo within the visible area resizes freely and stays normal', () => {
    const onUpdate = vi.fn()
    const c = useWindowResize({ maxVisiblePx: 800, defaultPx: 400, onUpdate })
    c.dragTo(600)
    expect(c.width.value).toBe(600)
    expect(c.phase.value).toBe('normal')
    expect(onUpdate).toHaveBeenLastCalledWith(600)
  })

  it('clamps to minPx on the low end', () => {
    const c = useWindowResize({ maxVisiblePx: 800, defaultPx: 400, minPx: 200 })
    c.dragTo(50)
    expect(c.width.value).toBe(200)
    expect(c.phase.value).toBe('normal')
  })

  it('holds at maxVisible and enters signaling when pushing past (not yet unlocked)', () => {
    const onEvent = vi.fn()
    const c = useWindowResize({ maxVisiblePx: 800, defaultPx: 400, onEvent })
    c.dragTo(1200)
    expect(c.width.value).toBe(800) // held at the soft-max
    expect(c.phase.value).toBe('signaling')
    expect(onEvent).toHaveBeenCalledWith('signal')
  })

  it('unlockBeyond lets a subsequent drag exceed the visible width', () => {
    const onEvent = vi.fn()
    const c = useWindowResize({ maxVisiblePx: 800, defaultPx: 400, onEvent })
    c.dragTo(1200) // signaling, held at 800
    c.unlockBeyond()
    expect(c.phase.value).toBe('beyond')
    expect(onEvent).toHaveBeenCalledWith('unlock')
    c.dragTo(1200)
    expect(c.width.value).toBe(1200)
  })

  it('beyond is capped at maxVisible * hardMaxFactor', () => {
    const c = useWindowResize({
      maxVisiblePx: 800,
      defaultPx: 400,
      hardMaxFactor: 2,
    })
    c.dragTo(1200)
    c.unlockBeyond()
    c.dragTo(999_999)
    expect(c.width.value).toBe(1600) // 800 * 2
  })

  it('endDrag relaxes a still-signaling drag back to normal (left at the max)', () => {
    const c = useWindowResize({ maxVisiblePx: 800, defaultPx: 400 })
    c.dragTo(1200)
    expect(c.phase.value).toBe('signaling')
    expect(c.width.value).toBe(800)
    c.endDrag()
    expect(c.phase.value).toBe('normal')
    expect(c.width.value).toBe(800)
  })

  it('endDrag leaves beyond untouched', () => {
    const c = useWindowResize({ maxVisiblePx: 800, defaultPx: 400 })
    c.dragTo(1200)
    c.unlockBeyond()
    c.dragTo(1200)
    c.endDrag()
    expect(c.phase.value).toBe('beyond')
    expect(c.width.value).toBe(1200)
  })

  it('reset() returns to the normal phase', () => {
    const onEvent = vi.fn()
    const c = useWindowResize({ maxVisiblePx: 800, defaultPx: 400, onEvent })
    c.dragTo(1200)
    c.unlockBeyond()
    c.reset()
    expect(c.phase.value).toBe('normal')
    expect(onEvent).toHaveBeenCalledWith('reset')
  })

  it('controlled width: change is requested via callback, not mutated locally', () => {
    const widthPx = ref<number | undefined>(400)
    const onUpdate = vi.fn()
    const c = useWindowResize({ maxVisiblePx: 800, widthPx, onUpdate })
    c.dragTo(600)
    expect(onUpdate).toHaveBeenCalledWith(600)
    expect(c.width.value).toBe(400) // parent must apply the change
    widthPx.value = 600
    expect(c.width.value).toBe(600)
  })

  it('reactive maxVisible getter updates the soft-max threshold', () => {
    const maxVisiblePx = ref(800)
    const c = useWindowResize({ maxVisiblePx, defaultPx: 400 })
    c.dragTo(700)
    expect(c.width.value).toBe(700)
    expect(c.phase.value).toBe('normal')
    maxVisiblePx.value = 600
    c.dragTo(700) // now past the (smaller) soft-max
    expect(c.width.value).toBe(600)
    expect(c.phase.value).toBe('signaling')
  })
})
