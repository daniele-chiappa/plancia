/**
 * Pure-ish state machine behind the window drag-resize handle. No DOM, no
 * component instance: it only reads reactive option getters and exposes
 * reactive state + transition methods, so it unit-tests in isolation (mirrors
 * `useSidebarController`).
 *
 * The distinctive bit is the *soft-max*: a window resizes freely up to the
 * visible width of the strip (`maxVisiblePx`). Pushing past it does not grow
 * the window — instead it holds at the max and enters the `signaling` phase.
 * The component, after a short dwell, calls `unlockBeyond()` which flips to the
 * `beyond` phase; only then does dragging exceed the viewport (the strip then
 * scrolls), up to a sane hard cap (`maxVisible * hardMaxFactor`).
 *
 * Controlled vs uncontrolled like the sidebar: if `opts.widthPx` resolves to a
 * value the width is controlled (mirrors a `v-model`); otherwise an internal ref
 * holds it. `onUpdate` fires on every committed change so a bound model stays in
 * sync.
 */
import { computed, ref, toValue, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue'

/** Defaults (px). Themers override the rendered preset via `--plancia-w-*`. */
export const DEFAULT_MIN_WIDTH = 240
/** A window may grow up to `maxVisible * this` once unlocked past the soft-max. */
export const DEFAULT_HARD_MAX_FACTOR = 3

/** Drag phase relative to the soft-max (= visible strip width). */
export type WindowResizePhase = 'normal' | 'signaling' | 'beyond'

export type WindowResizeEventType = 'resize' | 'signal' | 'unlock' | 'reset'

export interface WindowResizeControllerOptions {
  /** Controlled width in px. Resolves to `undefined` ⇒ uncontrolled (ref). */
  widthPx?: MaybeRefOrGetter<number | undefined>
  /** Initial width when uncontrolled (the currently-rendered px). */
  defaultPx?: number
  minPx?: MaybeRefOrGetter<number | undefined>
  /** Soft-max: the visible width of the strip (= `stripEl.clientWidth`). */
  maxVisiblePx: MaybeRefOrGetter<number>
  /** Hard cap factor applied to `maxVisiblePx` once `beyond`. Default 3. */
  hardMaxFactor?: number
  onUpdate?: (px: number) => void
  onEvent?: (e: WindowResizeEventType) => void
}

export interface WindowResizeController {
  width: ComputedRef<number>
  phase: Ref<WindowResizePhase>
  minPx: ComputedRef<number>
  maxVisiblePx: ComputedRef<number>
  hardMaxPx: ComputedRef<number>
  /** Drive the width from a candidate px (e.g. startWidth + dx). */
  dragTo: (px: number) => void
  /** Component calls this after the soft-max dwell to allow exceeding the max. */
  unlockBeyond: () => void
  /** End of a drag gesture: a `signaling` (still-held) drag relaxes to normal. */
  endDrag: () => void
  /** Hard reset back to the `normal` phase. */
  reset: () => void
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi)
}

export function useWindowResize(
  opts: WindowResizeControllerOptions,
): WindowResizeController {
  const controlled = computed(() => toValue(opts.widthPx) !== undefined)
  const minPx = computed(() => Math.max(0, toValue(opts.minPx) ?? DEFAULT_MIN_WIDTH))
  const maxVisiblePx = computed(() => Math.max(minPx.value, toValue(opts.maxVisiblePx)))
  const hardMaxFactor = opts.hardMaxFactor ?? DEFAULT_HARD_MAX_FACTOR
  const hardMaxPx = computed(() => maxVisiblePx.value * hardMaxFactor)

  const phase = ref<WindowResizePhase>('normal')
  // Internal width (uncontrolled). Stored raw; the `width` computed clamps it.
  const _width = ref<number>(opts.defaultPx ?? minPx.value)

  const width = computed<number>(() => {
    const raw = controlled.value ? (toValue(opts.widthPx) as number) : _width.value
    return clamp(raw, minPx.value, hardMaxPx.value)
  })

  /** Apply a committed width. Returns whether it actually changed. */
  function commit(next: number): boolean {
    const prev = width.value
    if (!controlled.value) _width.value = next
    const changed = next !== prev
    if (changed) {
      opts.onUpdate?.(next)
      opts.onEvent?.('resize')
    }
    return changed
  }

  function dragTo(px: number): void {
    if (phase.value === 'beyond') {
      commit(clamp(px, minPx.value, hardMaxPx.value))
      return
    }
    if (px <= maxVisiblePx.value) {
      // Within the visible area: free resize, stay normal.
      if (phase.value !== 'normal') phase.value = 'normal'
      commit(clamp(px, minPx.value, maxVisiblePx.value))
      return
    }
    // Pushing past the soft-max while not yet unlocked: hold at max, signal.
    commit(maxVisiblePx.value)
    if (phase.value !== 'signaling') {
      phase.value = 'signaling'
      opts.onEvent?.('signal')
    }
  }

  function unlockBeyond(): void {
    if (phase.value === 'beyond') return
    phase.value = 'beyond'
    opts.onEvent?.('unlock')
  }

  function endDrag(): void {
    // A drag that ended still pressed against the soft-max relaxes to normal
    // (the window is left exactly at the visible width).
    if (phase.value === 'signaling') phase.value = 'normal'
  }

  function reset(): void {
    if (phase.value !== 'normal') {
      phase.value = 'normal'
      opts.onEvent?.('reset')
    }
  }

  return {
    width,
    phase,
    minPx,
    maxVisiblePx,
    hardMaxPx,
    dragTo,
    unlockBeyond,
    endDrag,
    reset,
  }
}
