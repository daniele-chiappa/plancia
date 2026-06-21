/**
 * Pure-ish state machine behind <PlanciaSidebar>. No DOM, no component instance:
 * it only reads reactive option getters and exposes reactive state + transition
 * methods, so it unit-tests in isolation (like the windows store).
 *
 * Controlled vs uncontrolled is per-model: if `opts.state` resolves to a value
 * the state is controlled (the component mirrors a `v-model:state`); otherwise an
 * internal ref holds it. Same for `opts.size`. Transitions always call the
 * `onUpdate*` callbacks on real change so a bound v-model stays in sync.
 */
import { computed, ref, toValue, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue'
import type {
  SidebarEventType,
  SidebarMode,
  SidebarOrientation,
  SidebarPosition,
  SidebarState,
} from './types'

/** Defaults (px). Themers override the rendered size via `--plancia-sidebar-*`. */
export const DEFAULT_EXPANDED_SIZE = 256
export const DEFAULT_MIN_SIZE = 120
export const DEFAULT_MAX_SIZE = 640

export interface SidebarControllerOptions {
  position: MaybeRefOrGetter<SidebarPosition>
  mode?: MaybeRefOrGetter<SidebarMode>
  /** Controlled state. Resolves to `undefined` ⇒ uncontrolled (internal ref). */
  state?: MaybeRefOrGetter<SidebarState | undefined>
  /** Controlled cross-axis size in px. `undefined` ⇒ uncontrolled. */
  size?: MaybeRefOrGetter<number | undefined>
  defaultState?: SidebarState
  defaultSize?: number
  minSize?: MaybeRefOrGetter<number | undefined>
  maxSize?: MaybeRefOrGetter<number | undefined>
  onUpdateState?: (s: SidebarState) => void
  onUpdateSize?: (n: number) => void
  onEvent?: (e: SidebarEventType) => void
}

export interface SidebarController {
  state: ComputedRef<SidebarState>
  size: ComputedRef<number>
  orientation: ComputedRef<SidebarOrientation>
  peeking: Ref<boolean>
  /** True when the panel should render its expanded content (expanded OR peeking). */
  contentVisible: ComputedRef<boolean>
  expand: () => void
  collapse: () => void
  close: () => void
  /** Reveal from `closed` back to the last non-closed state. */
  open: () => void
  /** expanded ⇄ collapsed (from `closed`, reveals to expanded). */
  toggle: () => void
  /** Set an arbitrary state (used by the component to sync external v-model). */
  setState: (s: SidebarState) => void
  setSize: (px: number) => void
  setPeeking: (v: boolean) => void
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi)
}

export function useSidebarController(opts: SidebarControllerOptions): SidebarController {
  const _state = ref<SidebarState>(opts.defaultState ?? 'expanded')
  const _size = ref<number>(opts.defaultSize ?? DEFAULT_EXPANDED_SIZE)
  const _lastOpen = ref<SidebarState>(
    opts.defaultState && opts.defaultState !== 'closed' ? opts.defaultState : 'expanded',
  )
  const peeking = ref(false)

  const stateControlled = computed(() => toValue(opts.state) !== undefined)
  const sizeControlled = computed(() => toValue(opts.size) !== undefined)

  const orientation = computed<SidebarOrientation>(() => {
    const p = toValue(opts.position)
    return p === 'left' || p === 'right' ? 'vertical' : 'horizontal'
  })

  const minSize = computed(() => toValue(opts.minSize) ?? DEFAULT_MIN_SIZE)
  const maxSize = computed(() => toValue(opts.maxSize) ?? DEFAULT_MAX_SIZE)

  const state = computed<SidebarState>(() =>
    stateControlled.value ? (toValue(opts.state) as SidebarState) : _state.value,
  )
  const size = computed<number>(() => {
    const raw = sizeControlled.value ? (toValue(opts.size) as number) : _size.value
    return clamp(raw, minSize.value, maxSize.value)
  })

  const contentVisible = computed(() => state.value === 'expanded' || peeking.value)

  /** Apply a state transition. Returns whether it actually changed. */
  function commit(next: SidebarState): boolean {
    const prev = state.value
    if (next !== 'closed') _lastOpen.value = next
    if (!stateControlled.value) _state.value = next
    const changed = next !== prev
    if (changed) opts.onUpdateState?.(next)
    return changed
  }

  function expand(): void {
    if (commit('expanded')) opts.onEvent?.('expand')
  }
  function collapse(): void {
    if (commit('collapsed')) opts.onEvent?.('collapse')
  }
  function close(): void {
    if (commit('closed')) opts.onEvent?.('close')
  }
  function open(): void {
    if (commit(_lastOpen.value)) opts.onEvent?.('open')
  }
  function toggle(): void {
    if (state.value === 'expanded') collapse()
    else expand()
  }
  function setState(next: SidebarState): void {
    commit(next)
  }
  function setSize(px: number): void {
    const next = clamp(px, minSize.value, maxSize.value)
    const prev = size.value
    if (!sizeControlled.value) _size.value = next
    if (next !== prev) {
      opts.onUpdateSize?.(next)
      opts.onEvent?.('resize')
    }
  }
  function setPeeking(v: boolean): void {
    if (v === peeking.value) return
    peeking.value = v
    opts.onEvent?.(v ? 'peek-start' : 'peek-end')
  }

  return {
    state,
    size,
    orientation,
    peeking,
    contentVisible,
    expand,
    collapse,
    close,
    open,
    toggle,
    setState,
    setSize,
    setPeeking,
  }
}
