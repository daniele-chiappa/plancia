<script setup lang="ts">
/**
 * WindowFrame — chrome around one plancia window. Content-agnostic: the body is
 * the default <slot/>. Dependency-free icons (inline SVG) and CSS-variable
 * styling. Extra per-window buttons go through the `actions` slot (this is how
 * domain-specific actions like gosidian's ego-graph button stay OUT of the lib).
 */
import { computed, inject, onBeforeUnmount, ref } from 'vue'
import { useWindowsStore } from '../store/windows'
import { OPEN_WINDOW, CAN_OPEN_TYPE } from '../composables/openWindow'
import { DEFAULT_MIN_WIDTH, useWindowResize } from '../composables/useWindowResize'
import { DEFAULT_LABELS, type PlanciaLabels, type WindowInstance, type WindowTag } from '../types'

const props = withDefaults(
  defineProps<{
    win: WindowInstance
    /** Module label when the window is cross-module: header shows "[label]: title". */
    foreignLabel?: string | null
    labels?: PlanciaLabels
    /** Optional class to add to a tag/badge, derived from its `tone`. */
    resolveTone?: (tone?: string) => string
    /** Visible width of the strip (px) — the soft-max threshold for the drag. */
    maxVisiblePx?: number
    /** Minimum drag-resize width (px). */
    minWidthPx?: number
    /** Dwell (ms) at the soft-max before a drag may exceed the viewport. */
    softMaxDelayMs?: number
  }>(),
  {
    foreignLabel: null,
    labels: undefined,
    resolveTone: undefined,
    maxVisiblePx: undefined,
    minWidthPx: undefined,
    softMaxDelayMs: 300,
  },
)

const store = useWindowsStore()
const labels = computed(() => props.labels ?? DEFAULT_LABELS)

const openWindow = inject(OPEN_WINDOW, () => '')
const canOpenWindowType = inject(CAN_OPEN_TYPE, () => false)

const focused = computed(() => store.focusedId === props.win.id)
const titleAttr = computed(() =>
  props.foreignLabel ? `${props.foreignLabel}: ${props.win.title}` : props.win.title,
)

function toneClass(tone?: string): string {
  return props.resolveTone ? props.resolveTone(tone) : ''
}
function tagClickable(tag: WindowTag): boolean {
  return !!tag.open && canOpenWindowType(tag.open.type)
}
function onTagClick(tag: WindowTag): void {
  if (tagClickable(tag) && tag.open) openWindow(tag.open)
}

function onClose() {
  if (props.win.dirty && !window.confirm(labels.value.unsavedClose)) return
  store.close(props.win.id)
}

/* --- drag-resize (width) -------------------------------------------------- */
const sectionRef = ref<HTMLElement | null>(null)
const minWidthPx = computed(() => props.minWidthPx ?? DEFAULT_MIN_WIDTH)
// Soft-max: the visible strip width; until measured, fall back to a generous
// value so resizing still works (the strip's real width arrives via the prop).
const maxVisiblePx = computed(() => props.maxVisiblePx ?? 4096)

// Controlled by the store's `widthPx` (single source of truth, no drift): the
// controller computes the clamped/phased width and requests it via onUpdate →
// setWidthPx, which flows back in as the controlled value. While `widthPx` is
// null (preset width) the controller falls back to `defaultPx` for its math; a
// drag pins an explicit px first (onResizeStart) so it never reads null.
const controller = useWindowResize({
  widthPx: () => props.win.widthPx ?? undefined,
  defaultPx: minWidthPx.value,
  minPx: () => minWidthPx.value,
  maxVisiblePx: () => maxVisiblePx.value,
  onUpdate: (px) => store.setWidthPx(props.win.id, px),
})

const renderWidth = computed(() =>
  props.win.widthPx != null ? `${props.win.widthPx}px` : undefined,
)
const rootStyle = computed<Record<string, string>>(() => {
  const s: Record<string, string> = {}
  if (renderWidth.value) s['--plancia-window-w'] = renderWidth.value
  return s
})
const ariaNow = computed(() => Math.round(props.win.widthPx ?? 0))

let startX = 0
let startWidth = 0
let dwellTimer: ReturnType<typeof setTimeout> | undefined
// Last candidate width seen while signaling, so the dwell can re-apply it.
let pendingPx = 0

function clearDwell() {
  if (dwellTimer) {
    clearTimeout(dwellTimer)
    dwellTimer = undefined
  }
}

function currentRenderedWidth(): number {
  if (props.win.widthPx != null) return props.win.widthPx
  return sectionRef.value?.getBoundingClientRect().width ?? minWidthPx.value
}

function onPointerMove(e: PointerEvent) {
  const candidate = startWidth + (e.clientX - startX)
  pendingPx = candidate
  controller.dragTo(candidate)
  if (controller.phase.value === 'signaling') {
    // Still pushing past the soft-max → arm/keep the dwell timer; once it fires
    // the window is allowed to exceed the viewport.
    if (!dwellTimer) {
      dwellTimer = setTimeout(() => {
        dwellTimer = undefined
        controller.unlockBeyond()
        controller.dragTo(pendingPx)
      }, props.softMaxDelayMs)
    }
  } else {
    clearDwell()
  }
}

function endDrag() {
  clearDwell()
  controller.endDrag()
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
}

function onPointerUp(e: PointerEvent) {
  ;(e.target as HTMLElement)?.releasePointerCapture?.(e.pointerId)
  endDrag()
}

function onResizeStart(e: PointerEvent) {
  if (e.button != null && e.button !== 0) return
  startX = e.clientX
  startWidth = currentRenderedWidth()
  controller.reset()
  // Pin to the currently-rendered px first, so the next drags are relative.
  store.setWidthPx(props.win.id, Math.round(startWidth))
  ;(e.currentTarget as HTMLElement)?.setPointerCapture?.(e.pointerId)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  e.preventDefault()
}

function resetWidth() {
  store.resetWidth(props.win.id)
  controller.reset()
}

function onResizeKey(e: KeyboardEvent) {
  if (e.key === 'Home') {
    resetWidth()
    e.preventDefault()
    return
  }
  let dir = 0
  if (e.key === 'ArrowRight') dir = 1
  else if (e.key === 'ArrowLeft') dir = -1
  if (!dir) return
  const step = e.shiftKey ? 64 : 24
  const base = currentRenderedWidth()
  store.setWidthPx(props.win.id, Math.round(base) + dir * step)
  e.preventDefault()
}

function onResizeDblClick() {
  resetWidth()
}

onBeforeUnmount(() => {
  clearDwell()
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
})
</script>

<template>
  <section
    ref="sectionRef"
    :data-win-id="win.id"
    :data-width="win.width"
    :data-resize-phase="controller.phase.value"
    class="plancia-window"
    :class="{ 'plancia-window--focused': focused }"
    :style="rootStyle"
    @mousedown="store.focus(win.id)"
  >
    <header class="plancia-window__header">
      <div class="plancia-window__titlerow">
        <span class="plancia-window__title" :title="titleAttr">
          <span v-if="foreignLabel" class="plancia-window__badge">{{ foreignLabel }}</span>
          {{ win.title || '—' }}
          <span v-if="win.dirty" class="plancia-window__dirty" :title="labels.dirty">•</span>
        </span>

        <!-- Domain-specific per-window actions injected by the host app. -->
        <slot name="actions" :win="win" />

        <button
          type="button"
          class="plancia-btn"
          :title="`${labels.resize} (${win.width.toUpperCase()})`"
          :aria-label="labels.resize"
          @click="store.cycleWidth(win.id)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </button>
        <button
          type="button"
          class="plancia-btn"
          :title="labels.minimize"
          :aria-label="labels.minimize"
          @click="store.minimize(win.id)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <button
          type="button"
          class="plancia-btn plancia-btn--danger"
          :title="labels.close"
          :aria-label="labels.close"
          @click="onClose"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div v-if="win.tags.length" class="plancia-window__tags">
        <component
          :is="tagClickable(tag) ? 'button' : 'span'"
          v-for="(tag, i) in win.tags"
          :key="i"
          :type="tagClickable(tag) ? 'button' : undefined"
          class="plancia-tag"
          :class="toneClass(tag.tone)"
          :data-tone="tag.tone || undefined"
          :title="tagClickable(tag) ? `${labels.openTag}: ${tag.label}` : tag.label"
          @click="onTagClick(tag)"
          >{{ tag.label }}</component
        >
      </div>
    </header>

    <div class="plancia-window__body">
      <slot />
    </div>

    <!-- Right-edge drag handle: continuous width resize (coexists with the
         preset cycle). Keyboard-operable; double-click clears the px width. -->
    <div
      class="plancia-window__resize"
      role="separator"
      aria-orientation="vertical"
      :aria-label="labels.resizeWidth ?? DEFAULT_LABELS.resizeWidth"
      tabindex="0"
      :aria-valuemin="minWidthPx"
      :aria-valuemax="Math.round(controller.hardMaxPx.value)"
      :aria-valuenow="ariaNow"
      @pointerdown="onResizeStart"
      @keydown="onResizeKey"
      @dblclick="onResizeDblClick"
    />
  </section>
</template>
