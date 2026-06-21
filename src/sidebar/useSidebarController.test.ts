import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import {
  useSidebarController,
  DEFAULT_EXPANDED_SIZE,
  DEFAULT_MAX_SIZE,
  DEFAULT_MIN_SIZE,
} from './useSidebarController'
import type { SidebarPosition, SidebarState } from './types'

describe('useSidebarController', () => {
  it('derives orientation from position (reactive)', () => {
    const position = ref<SidebarPosition>('left')
    const c = useSidebarController({ position })
    expect(c.orientation.value).toBe('vertical')
    position.value = 'top'
    expect(c.orientation.value).toBe('horizontal')
    position.value = 'right'
    expect(c.orientation.value).toBe('vertical')
    position.value = 'bottom'
    expect(c.orientation.value).toBe('horizontal')
  })

  it('defaults to expanded + default size when uncontrolled', () => {
    const c = useSidebarController({ position: 'left' })
    expect(c.state.value).toBe('expanded')
    expect(c.size.value).toBe(DEFAULT_EXPANDED_SIZE)
    expect(c.contentVisible.value).toBe(true)
  })

  it('honours defaultState / defaultSize', () => {
    const c = useSidebarController({ position: 'left', defaultState: 'collapsed', defaultSize: 300 })
    expect(c.state.value).toBe('collapsed')
    expect(c.size.value).toBe(300)
    expect(c.contentVisible.value).toBe(false)
  })

  it('transitions expand/collapse/close and reflects contentVisible', () => {
    const c = useSidebarController({ position: 'left' })
    c.collapse()
    expect(c.state.value).toBe('collapsed')
    expect(c.contentVisible.value).toBe(false)
    c.expand()
    expect(c.state.value).toBe('expanded')
    expect(c.contentVisible.value).toBe(true)
    c.close()
    expect(c.state.value).toBe('closed')
  })

  it('toggle flips expanded ⇄ collapsed, and reveals from closed', () => {
    const c = useSidebarController({ position: 'left' })
    c.toggle()
    expect(c.state.value).toBe('collapsed')
    c.toggle()
    expect(c.state.value).toBe('expanded')
    c.close()
    c.toggle()
    expect(c.state.value).toBe('expanded')
  })

  it('open() restores the last non-closed state', () => {
    const c = useSidebarController({ position: 'left' })
    c.collapse()
    c.close()
    expect(c.state.value).toBe('closed')
    c.open()
    expect(c.state.value).toBe('collapsed')
  })

  it('emits update:state + semantic events only on real change', () => {
    const onUpdateState = vi.fn()
    const onEvent = vi.fn()
    const c = useSidebarController({ position: 'left', onUpdateState, onEvent })
    c.expand() // already expanded → no change
    expect(onUpdateState).not.toHaveBeenCalled()
    expect(onEvent).not.toHaveBeenCalled()
    c.collapse()
    expect(onUpdateState).toHaveBeenLastCalledWith('collapsed')
    expect(onEvent).toHaveBeenLastCalledWith('collapse')
    c.close()
    expect(onEvent).toHaveBeenLastCalledWith('close')
  })

  it('controlled state: change is requested via callback and reflected when parent applies', () => {
    const state = ref<SidebarState | undefined>('expanded')
    const onUpdateState = vi.fn((s: SidebarState) => {
      state.value = s
    })
    const c = useSidebarController({ position: 'left', state, onUpdateState })
    c.collapse()
    expect(onUpdateState).toHaveBeenCalledWith('collapsed')
    expect(c.state.value).toBe('collapsed')
  })

  it('controlled state stays put if the parent ignores the update', () => {
    const state = ref<SidebarState | undefined>('expanded')
    const onUpdateState = vi.fn()
    const c = useSidebarController({ position: 'left', state, onUpdateState })
    c.collapse()
    expect(onUpdateState).toHaveBeenCalledWith('collapsed')
    expect(c.state.value).toBe('expanded')
  })

  it('size clamps to [min,max] and emits resize on change', () => {
    const onUpdateSize = vi.fn()
    const onEvent = vi.fn()
    const c = useSidebarController({ position: 'left', onUpdateSize, onEvent })
    c.setSize(10_000)
    expect(c.size.value).toBe(DEFAULT_MAX_SIZE)
    expect(onUpdateSize).toHaveBeenLastCalledWith(DEFAULT_MAX_SIZE)
    expect(onEvent).toHaveBeenLastCalledWith('resize')
    c.setSize(0)
    expect(c.size.value).toBe(DEFAULT_MIN_SIZE)
  })

  it('respects custom min/max bounds', () => {
    const c = useSidebarController({
      position: 'left',
      minSize: 200,
      maxSize: 400,
      defaultSize: 300,
    })
    c.setSize(1000)
    expect(c.size.value).toBe(400)
    c.setSize(50)
    expect(c.size.value).toBe(200)
  })

  it('does not emit resize when the clamped value is unchanged', () => {
    const onUpdateSize = vi.fn()
    const c = useSidebarController({
      position: 'left',
      maxSize: 400,
      defaultSize: 400,
      onUpdateSize,
    })
    c.setSize(900) // clamps back to 400 == current
    expect(onUpdateSize).not.toHaveBeenCalled()
  })

  it('controlled size does not mutate locally', () => {
    const size = ref<number | undefined>(300)
    const onUpdateSize = vi.fn()
    const c = useSidebarController({ position: 'left', size, onUpdateSize })
    c.setSize(350)
    expect(onUpdateSize).toHaveBeenCalledWith(350)
    expect(c.size.value).toBe(300)
  })

  it('peeking toggles, emits peek-start/peek-end, and drives contentVisible', () => {
    const onEvent = vi.fn()
    const c = useSidebarController({ position: 'left', defaultState: 'collapsed', onEvent })
    expect(c.contentVisible.value).toBe(false)
    c.setPeeking(true)
    expect(c.peeking.value).toBe(true)
    expect(c.contentVisible.value).toBe(true)
    expect(onEvent).toHaveBeenLastCalledWith('peek-start')
    c.setPeeking(true) // no-op, no extra event
    expect(onEvent).toHaveBeenCalledTimes(1)
    c.setPeeking(false)
    expect(onEvent).toHaveBeenLastCalledWith('peek-end')
  })
})
