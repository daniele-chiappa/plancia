<script setup lang="ts">
/**
 * PlanciaSidebar — content-agnostic, themeable sidebar for the 4 edges, with
 * closed/collapsed/expanded states and an independent body scroll. Same
 * philosophy as the window-manager: CSS variables (no Tailwind), inline SVG (no
 * lucide), injectable strings (no i18n lock-in), a11y-aware.
 *
 * Modes: `inline` (takes layout space, content reflows), `overlay` (sits over
 * the content), `floating` (overlay + detached card). Optional drag-resize,
 * hover-peek, and a responsive drawer (auto-overlay + backdrop under a
 * breakpoint). State lives in a pure controller (`useSidebarController`) and is
 * exposed as `v-model:state` / `v-model:size` and via provide/inject
 * (`usePlanciaSidebar`).
 */
import { computed, onBeforeUnmount, onMounted, provide, ref, useId, watch } from 'vue'
import '../style.css'
import { useSidebarController } from '../sidebar/useSidebarController'
import { SIDEBAR_CONTROL } from '../sidebar/usePlanciaSidebar'
import {
  DEFAULT_SIDEBAR_LABELS,
  type SidebarLabels,
  type SidebarMode,
  type SidebarPosition,
  type SidebarSlotProps,
  type SidebarState,
} from '../sidebar/types'

const props = withDefaults(
  defineProps<{
    position?: SidebarPosition
    mode?: SidebarMode
    /** v-model:state. Omit for uncontrolled (uses `defaultState`). */
    state?: SidebarState
    defaultState?: SidebarState
    /** v-model:size (px on the cross axis). Omit for uncontrolled. */
    size?: number
    defaultSize?: number
    /** Collapsed rail size; number → px, string → any CSS length. */
    railSize?: number | string
    minSize?: number
    maxSize?: number
    /** Show a drag handle on the inner edge to resize the expanded panel. */
    resizable?: boolean
    /** Hover-peek (transient expand while collapsed). Default: true for
     *  overlay/floating, false for inline. */
    peek?: boolean
    peekDelay?: { open: number; close: number }
    /** Below this viewport width (px) the sidebar becomes an overlay drawer. */
    responsive?: number | false
    /** Backdrop behind the panel. Default: only while a responsive drawer is open. */
    backdrop?: boolean
    labels?: Partial<SidebarLabels>
    /** ARIA landmark role. `none` omits the role. */
    landmark?: 'navigation' | 'complementary' | 'region' | 'none'
    ariaLabel?: string
  }>(),
  {
    position: 'left',
    mode: 'inline',
    state: undefined,
    defaultState: 'expanded',
    size: undefined,
    defaultSize: undefined,
    railSize: undefined,
    minSize: undefined,
    maxSize: undefined,
    resizable: false,
    peek: undefined,
    peekDelay: () => ({ open: 120, close: 240 }),
    responsive: false,
    backdrop: undefined,
    labels: undefined,
    landmark: 'complementary',
    ariaLabel: undefined,
  },
)

const emit = defineEmits<{
  'update:state': [SidebarState]
  'update:size': [number]
  open: []
  close: []
  collapse: []
  expand: []
  'peek-start': []
  'peek-end': []
  resize: [number]
}>()

/* --- responsive drawer ---------------------------------------------------- */
const isNarrow = ref(false)
let mql: MediaQueryList | undefined
function onMqlChange(e: MediaQueryListEvent) {
  isNarrow.value = e.matches
}
function setupMql() {
  teardownMql()
  if (props.responsive && typeof window !== 'undefined' && window.matchMedia) {
    mql = window.matchMedia(`(max-width: ${props.responsive}px)`)
    isNarrow.value = mql.matches
    mql.addEventListener('change', onMqlChange)
  } else {
    isNarrow.value = false
  }
}
function teardownMql() {
  if (mql) {
    mql.removeEventListener('change', onMqlChange)
    mql = undefined
  }
}
/** A responsive drawer forces overlay regardless of the `mode` prop. */
const effectiveMode = computed<SidebarMode>(() => (isNarrow.value ? 'overlay' : props.mode))

const ctrl = useSidebarController({
  position: () => props.position,
  mode: () => effectiveMode.value,
  state: () => props.state,
  size: () => props.size,
  defaultState: props.defaultState,
  defaultSize: props.defaultSize,
  minSize: () => props.minSize,
  maxSize: () => props.maxSize,
  onUpdateState: (s) => emit('update:state', s),
  onUpdateSize: (n) => {
    emit('update:size', n)
    emit('resize', n)
  },
  onEvent: (e) => {
    switch (e) {
      case 'expand':
        emit('expand')
        break
      case 'collapse':
        emit('collapse')
        break
      case 'close':
        emit('close')
        break
      case 'open':
        emit('open')
        break
      case 'peek-start':
        emit('peek-start')
        break
      case 'peek-end':
        emit('peek-end')
        break
      case 'resize':
        break // emitted via onUpdateSize
    }
  },
})

const uid = useId()
const panelId = `plancia-sidebar-${uid}`
const bodyId = `${panelId}-body`

const labels = computed<SidebarLabels>(() => ({ ...DEFAULT_SIDEBAR_LABELS, ...props.labels }))

const landmarkRole = computed(() => (props.landmark === 'none' ? undefined : props.landmark))

/* --- size / CSS-var contract --------------------------------------------- */
const userResized = ref(false)
// Pin `--plancia-sidebar-size` only when a size is explicit (prop or drag), so
// the themeable `--plancia-sidebar-expanded-size` otherwise wins.
const hasExplicitSize = computed(
  () => props.size != null || props.defaultSize != null || userResized.value,
)
const rootStyle = computed<Record<string, string>>(() => {
  const s: Record<string, string> = {}
  if (hasExplicitSize.value) s['--plancia-sidebar-size'] = `${ctrl.size.value}px`
  if (props.railSize != null) {
    s['--plancia-sidebar-rail'] =
      typeof props.railSize === 'number' ? `${props.railSize}px` : props.railSize
  }
  return s
})

const slotProps = computed<SidebarSlotProps>(() => ({
  state: ctrl.state.value,
  position: props.position,
  orientation: ctrl.orientation.value,
  mode: effectiveMode.value,
  size: ctrl.size.value,
  peeking: ctrl.peeking.value,
  contentVisible: ctrl.contentVisible.value,
  expand: ctrl.expand,
  collapse: ctrl.collapse,
  close: ctrl.close,
  open: ctrl.open,
  toggle: ctrl.toggle,
}))

const toggleLabel = computed(() =>
  ctrl.state.value === 'expanded' ? labels.value.collapse : labels.value.expand,
)

/* --- hover-peek (overlay/floating only) ----------------------------------- */
const peekEnabled = computed(() => props.peek ?? effectiveMode.value !== 'inline')
let openTimer: ReturnType<typeof setTimeout> | undefined
let closeTimer: ReturnType<typeof setTimeout> | undefined
function clearTimers() {
  if (openTimer) clearTimeout(openTimer)
  if (closeTimer) clearTimeout(closeTimer)
  openTimer = closeTimer = undefined
}
function onPointerEnter() {
  if (!peekEnabled.value || ctrl.state.value !== 'collapsed') return
  if (closeTimer) {
    clearTimeout(closeTimer)
    closeTimer = undefined
  }
  if (ctrl.peeking.value || openTimer) return
  openTimer = setTimeout(() => {
    openTimer = undefined
    ctrl.setPeeking(true)
  }, props.peekDelay.open)
}
function onPointerLeave() {
  if (openTimer) {
    clearTimeout(openTimer)
    openTimer = undefined
  }
  if (!ctrl.peeking.value) return
  closeTimer = setTimeout(() => {
    closeTimer = undefined
    ctrl.setPeeking(false)
  }, props.peekDelay.close)
}
/** Esc steps the sidebar down (peek → collapsed → closed), overlay/floating only. */
function onEsc() {
  if (effectiveMode.value === 'inline') return
  if (ctrl.peeking.value) {
    ctrl.setPeeking(false)
    return
  }
  if (ctrl.state.value === 'expanded') ctrl.collapse()
  else if (ctrl.state.value === 'collapsed') ctrl.close()
}

// A committed state change away from `collapsed` must cancel any peek.
watch(
  () => ctrl.state.value,
  (s) => {
    if (s !== 'collapsed') {
      clearTimers()
      ctrl.setPeeking(false)
    }
  },
)

/* --- drag resize ---------------------------------------------------------- */
const asideRef = ref<HTMLElement | null>(null)
const resizing = ref(false)
let dragOrigin = 0
let dragStartSize = 0
const canResize = computed(() => props.resizable && ctrl.state.value === 'expanded')

function resizeDelta(clientX: number, clientY: number): number {
  const vertical = ctrl.orientation.value === 'vertical'
  let delta = (vertical ? clientX : clientY) - dragOrigin
  if (props.position === 'right' || props.position === 'bottom') delta = -delta
  return delta
}
function onResizeMove(e: PointerEvent) {
  ctrl.setSize(dragStartSize + resizeDelta(e.clientX, e.clientY))
}
function onResizeEnd() {
  resizing.value = false
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', onResizeEnd)
}
function onResizeStart(e: PointerEvent) {
  if (!canResize.value || !asideRef.value) return
  const rect = asideRef.value.getBoundingClientRect()
  const vertical = ctrl.orientation.value === 'vertical'
  dragStartSize = vertical ? rect.width : rect.height
  dragOrigin = vertical ? e.clientX : e.clientY
  userResized.value = true
  resizing.value = true
  ctrl.setSize(dragStartSize) // pin to the actually-rendered size first
  window.addEventListener('pointermove', onResizeMove)
  window.addEventListener('pointerup', onResizeEnd)
  e.preventDefault()
}
function onResizeKey(e: KeyboardEvent) {
  const vertical = ctrl.orientation.value === 'vertical'
  let dir = 0
  if (vertical) dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
  else dir = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
  if (!dir) return
  if (props.position === 'right' || props.position === 'bottom') dir = -dir
  userResized.value = true
  ctrl.setSize(ctrl.size.value + dir * (e.shiftKey ? 48 : 16))
  e.preventDefault()
}

/* --- backdrop (responsive drawer / opt-in) -------------------------------- */
const showBackdrop = computed(() => {
  if (effectiveMode.value === 'inline') return false
  const want = props.backdrop ?? isNarrow.value
  return want && ctrl.contentVisible.value
})
function onBackdrop() {
  if (isNarrow.value) ctrl.close()
  else ctrl.collapse()
}

onMounted(setupMql)
watch(() => props.responsive, setupMql)
onBeforeUnmount(() => {
  clearTimers()
  teardownMql()
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', onResizeEnd)
})

provide(SIDEBAR_CONTROL, {
  state: ctrl.state,
  size: ctrl.size,
  orientation: ctrl.orientation,
  position: computed(() => props.position),
  mode: effectiveMode,
  peeking: ctrl.peeking,
  contentVisible: ctrl.contentVisible,
  expand: ctrl.expand,
  collapse: ctrl.collapse,
  close: ctrl.close,
  open: ctrl.open,
  toggle: ctrl.toggle,
  setSize: ctrl.setSize,
})
</script>

<template>
  <aside
    ref="asideRef"
    class="plancia-sidebar"
    :class="`plancia-sidebar--${effectiveMode}`"
    :data-position="props.position"
    :data-orientation="ctrl.orientation.value"
    :data-mode="effectiveMode"
    :data-state="ctrl.state.value"
    :data-peeking="ctrl.peeking.value ? '' : undefined"
    :data-resizing="resizing ? '' : undefined"
    :data-drawer="isNarrow ? '' : undefined"
    :style="rootStyle"
    :role="landmarkRole"
    :aria-label="ariaLabel ?? labels.sidebar"
    @pointerenter="onPointerEnter"
    @pointerleave="onPointerLeave"
    @keydown.esc="onEsc"
  >
    <!-- Reveal tab: the only affordance left when closed. -->
    <button
      v-if="ctrl.state.value === 'closed'"
      type="button"
      class="plancia-btn plancia-sidebar__reveal"
      :title="labels.open"
      :aria-label="labels.open"
      :aria-expanded="false"
      :aria-controls="panelId"
      @click="ctrl.open()"
    >
      <slot name="reveal" v-bind="slotProps">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </slot>
    </button>

    <div v-show="ctrl.state.value !== 'closed'" :id="panelId" class="plancia-sidebar__panel">
      <header class="plancia-sidebar__header">
        <slot name="header" v-bind="slotProps" />
        <slot name="toggle" v-bind="slotProps">
          <button
            type="button"
            class="plancia-btn plancia-sidebar__toggle"
            :title="toggleLabel"
            :aria-label="toggleLabel"
            :aria-expanded="ctrl.contentVisible.value"
            :aria-controls="bodyId"
            @click="ctrl.toggle()"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </slot>
      </header>

      <div :id="bodyId" class="plancia-sidebar__body">
        <slot v-if="ctrl.contentVisible.value || !$slots.collapsed" v-bind="slotProps" />
        <slot v-else name="collapsed" v-bind="slotProps" />
      </div>

      <footer v-if="$slots.footer" class="plancia-sidebar__footer">
        <slot name="footer" v-bind="slotProps" />
      </footer>
    </div>

    <!-- Resize handle on the inner edge. -->
    <div
      v-if="canResize"
      class="plancia-sidebar__resize"
      role="separator"
      :aria-orientation="ctrl.orientation.value"
      :aria-label="labels.resize"
      tabindex="0"
      @pointerdown="onResizeStart"
      @keydown="onResizeKey"
    />

    <Teleport to="body">
      <div v-if="showBackdrop" class="plancia-sidebar__backdrop" @click="onBackdrop" />
    </Teleport>
  </aside>
</template>
