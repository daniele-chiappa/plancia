<script setup lang="ts">
/**
 * Plancia — a tiled window manager with two layouts, switchable at runtime:
 *
 * - `strip` (default): the niri-style horizontal strip of windows with
 *   scroll-snap, plus a horizontally-scrollable footer of minimized windows.
 *   Every visible window is mounted side by side.
 * - `tabs`: a horizontally-scrollable tab bar (each tab shows the window title
 *   and a direct close button) over a single full-width pane that mounts only
 *   the focused window, kept alive up to `keepAliveMax`. Cheaper with many
 *   windows — see the perf notes in the README.
 *
 * Generic: the type→component `registry` decides what each window renders.
 * Abstracted from the products-dc and gosidian "WindowManager" implementations,
 * with all app-specific concerns (Tailwind tokens, i18n, lucide icons, module
 * label/tone maps, domain buttons) lifted out into props/slots.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch, watchEffect } from 'vue'
import '../style.css'
import WindowFrame from './WindowFrame.vue'
import { useWindowsStore } from '../store/windows'
import { OPEN_WINDOW, CAN_OPEN_TYPE } from '../composables/openWindow'
import { usePlanciaConfig } from '../config/usePlanciaConfig'
import {
  DEFAULT_LABELS,
  type PlanciaLabels,
  type ViewMode,
  type WindowInstance,
  type WindowRegistry,
  type WindowWidth,
} from '../types'

const props = withDefaults(
  defineProps<{
  /** Window-type → content component map. Makes the manager generic. */
  registry: WindowRegistry
  /** "Owner" type of this plancia. Windows of a different type are cross-module
   *  and get a "[label]: title" header prefix. Omitted ⇒ no foreign windows. */
  nativeType?: string
  /** Resolves a human label for a foreign window type. Default: identity. */
  moduleLabel?: (type: string) => string
  /** Partial label overrides merged over the English defaults. */
  labels?: Partial<PlanciaLabels>
  /** Resize-button cycle order. Default ['s','m','full']. */
  widthCycle?: WindowWidth[]
  /** Width of windows opened without an explicit width. Default 'm'. */
  defaultWidth?: WindowWidth
  /** Minimum drag-resize width (px). Default 240. */
  minWidthPx?: number
  /** Dwell (ms) at the viewport-fit soft-max before a drag may exceed it.
   *  Default 300. */
  softMaxDelayMs?: number
  /** Optional class to add to a tag/badge, derived from its `tone`. */
  resolveTone?: (tone?: string) => string
  /** In `tabs` mode, how many window subtrees to keep mounted (LRU). Default 5. */
  keepAliveMax?: number
  /** Render the built-in view toggle in the tab bar. Default true. Override its
   *  content with the `view-toggle` slot ({ mode, toggle }). */
  showViewToggle?: boolean
  }>(),
  { showViewToggle: true },
)

/** Layout mode. Controlled with `v-model:view-mode`; otherwise an internal ref
 *  that falls back to the config default, then 'strip'. */
const viewModelRaw = defineModel<ViewMode | undefined>('viewMode', { default: undefined })

const store = useWindowsStore()
const cfg = usePlanciaConfig()
const labels = computed<PlanciaLabels>(() => ({
  ...DEFAULT_LABELS,
  ...cfg?.value.components?.window?.labels,
  ...props.labels,
}))

const viewMode = computed<ViewMode>({
  get: () => viewModelRaw.value ?? cfg?.value.components?.window?.defaults?.viewMode ?? 'strip',
  set: (v) => {
    viewModelRaw.value = v
  },
})
function toggleView(): void {
  viewMode.value = viewMode.value === 'tabs' ? 'strip' : 'tabs'
}
const keepAliveMax = computed(
  () => props.keepAliveMax ?? cfg?.value.components?.window?.defaults?.keepAliveMax ?? 5,
)

// Apply (and keep in sync) the width configuration from props (or config).
watchEffect(() =>
  store.configure({
    widthCycle: props.widthCycle ?? cfg?.value.components?.window?.defaults?.widthCycle,
    defaultWidth: props.defaultWidth ?? cfg?.value.components?.window?.defaults?.defaultWidth,
  }),
)

// Drag-resize knobs (precedence prop › config › builtin).
const minWidthPx = computed(
  () => props.minWidthPx ?? cfg?.value.components?.window?.defaults?.minWidthPx ?? 240,
)
const softMaxDelayMs = computed(
  () => props.softMaxDelayMs ?? cfg?.value.components?.window?.defaults?.softMaxDelayMs ?? 300,
)

function foreignLabel(w: WindowInstance): string | null {
  if (!props.nativeType || w.type === props.nativeType) return null
  return props.moduleLabel ? props.moduleLabel(w.type) : w.type
}

/** Close honouring the unsaved-changes guard (same as the window header). */
function closeWindow(w: WindowInstance): void {
  if (w.dirty && !window.confirm(labels.value.unsavedClose)) return
  store.close(w.id)
}

const stripEl = ref<HTMLElement | null>(null)
const tabsEl = ref<HTMLElement | null>(null)

// Visible width of the strip (the soft-max threshold for window drag-resize),
// kept in sync with the layout via a ResizeObserver. Only meaningful in strip
// mode; re-attached whenever the strip (re)appears.
const stripWidth = ref(0)
let ro: ResizeObserver | undefined
function measureStrip() {
  if (stripEl.value) stripWidth.value = stripEl.value.clientWidth
}
function observeStrip() {
  ro?.disconnect()
  ro = undefined
  measureStrip()
  if (typeof ResizeObserver !== 'undefined' && stripEl.value) {
    ro = new ResizeObserver(measureStrip)
    ro.observe(stripEl.value)
  }
}

// Nested content opens sibling windows without prop-drilling.
provide(OPEN_WINDOW, (spec) => store.open(spec))
// A tag is clickable only if its window-type is registered in this plancia.
provide(CAN_OPEN_TYPE, (type: string) => !!props.registry[type])

// Tabs mode always shows a window: if none is focused but some are visible,
// focus the first so the pane is never blank.
watchEffect(() => {
  if (viewMode.value !== 'tabs') return
  if (store.focused || !store.visible.length) return
  const first = store.visible[0]
  if (first) store.focus(first.id)
})

// Bring the focused window (strip) / active tab (tabs) fully into view.
watchEffect(() => {
  const id = store.focusedId
  if (!id) return
  const mode = viewMode.value
  nextTick(() => {
    const container = mode === 'tabs' ? tabsEl.value : stripEl.value
    const sel = mode === 'tabs' ? `[data-tab-id="${id}"]` : `[data-win-id="${id}"]`
    container
      ?.querySelector<HTMLElement>(sel)
      ?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' })
  })
})

// Re-attach the strip observer whenever we (re)enter strip mode.
watch(viewMode, () => nextTick(observeStrip))

function onKey(e: KeyboardEvent) {
  if (!e.altKey) return
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    store.focusAdjacent(-1)
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    store.focusAdjacent(1)
  }
}
onMounted(() => {
  document.addEventListener('keydown', onKey)
  observeStrip()
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  ro?.disconnect()
  ro = undefined
})
</script>

<template>
  <div class="plancia">
    <!-- Edge sidebar slots. Drop a <PlanciaSidebar position="…"> (or anything)
         in the matching slot; top/bottom span the full width, left/right flank
         the strip. Slot content is inside <Plancia>, so it can `useOpenWindow()`. -->
    <slot name="sidebar-top" />

    <div class="plancia__mid">
      <slot name="sidebar-left" />

      <div class="plancia__main">
        <!-- Tabs mode: a scrollable tab bar over a single full-width pane. -->
        <template v-if="viewMode === 'tabs'">
          <div class="plancia__tabbar">
            <div ref="tabsEl" class="plancia__tabs" role="tablist">
              <div
                v-for="w in store.visible"
                :key="w.id"
                class="plancia__tab"
                :class="{ 'plancia__tab--active': store.focusedId === w.id }"
                :data-tab-id="w.id"
              >
                <button
                  type="button"
                  class="plancia__tab-name"
                  role="tab"
                  :aria-selected="store.focusedId === w.id"
                  :title="w.title || '—'"
                  @click="store.focus(w.id)"
                >
                  <span class="plancia__tab-text">{{ w.title || '—' }}</span>
                  <span v-if="w.dirty" class="plancia__tab-dirty" :title="labels.dirty">•</span>
                </button>
                <button
                  type="button"
                  class="plancia__tab-close"
                  :title="labels.close"
                  :aria-label="labels.close"
                  @click="closeWindow(w)"
                >
                  ✕
                </button>
              </div>
            </div>

            <!-- Built-in view toggle (override via the `view-toggle` slot). -->
            <slot name="view-toggle" :mode="viewMode" :toggle="toggleView">
              <button
                v-if="showViewToggle"
                type="button"
                class="plancia-btn plancia__view-toggle"
                :title="labels.viewToggle ?? DEFAULT_LABELS.viewToggle"
                :aria-label="labels.viewToggle ?? DEFAULT_LABELS.viewToggle"
                @click="toggleView"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="16" rx="1" />
                  <line x1="9" y1="4" x2="9" y2="20" />
                </svg>
              </button>
            </slot>
          </div>

          <div class="plancia__content plancia__content--tabs">
            <KeepAlive :max="keepAliveMax">
              <WindowFrame
                v-if="store.focused"
                :key="store.focused.id"
                :win="store.focused"
                fill
                :foreign-label="foreignLabel(store.focused)"
                :labels="labels"
                :resolve-tone="resolveTone"
              >
                <template #actions="slotProps">
                  <slot name="window-actions" v-bind="slotProps" />
                </template>

                <component
                  :is="registry[store.focused.type]"
                  v-if="registry[store.focused.type]"
                  v-bind="store.focused.props"
                  @title="store.setTitle(store.focused.id, $event)"
                  @dirty="store.setDirty(store.focused.id, $event)"
                  @identify="store.identify(store.focused.id, $event.key, $event.props)"
                  @changed="store.touch()"
                  @tags="store.setTags(store.focused.id, $event)"
                  @close="store.close(store.focused.id)"
                />
                <div v-else style="padding: 1rem; font-size: 0.875rem; color: var(--plancia-danger)">
                  {{ labels.unknownType(store.focused.type) }}
                </div>
              </WindowFrame>
            </KeepAlive>

            <div v-if="!store.visible.length" class="plancia__empty">
              <slot name="empty">
                <div>
                  <p>{{ labels.empty }}</p>
                  <p v-if="store.minimizedList.length">
                    {{ labels.minimizedHint(store.minimizedList.length) }}
                  </p>
                  <p v-else>{{ labels.openHint }}</p>
                </div>
              </slot>
            </div>
          </div>
        </template>

        <!-- Strip mode: the niri-style horizontal strip. -->
        <div v-else ref="stripEl" class="plancia__strip">
          <WindowFrame
            v-for="w in store.visible"
            :key="w.id"
            :win="w"
            :foreign-label="foreignLabel(w)"
            :labels="labels"
            :resolve-tone="resolveTone"
            :max-visible-px="stripWidth"
            :min-width-px="minWidthPx"
            :soft-max-delay-ms="softMaxDelayMs"
          >
            <template #actions="slotProps">
              <slot name="window-actions" v-bind="slotProps" />
            </template>

            <component
              :is="registry[w.type]"
              v-if="registry[w.type]"
              v-bind="w.props"
              @title="store.setTitle(w.id, $event)"
              @dirty="store.setDirty(w.id, $event)"
              @identify="store.identify(w.id, $event.key, $event.props)"
              @changed="store.touch()"
              @tags="store.setTags(w.id, $event)"
              @close="store.close(w.id)"
            />
            <div v-else style="padding: 1rem; font-size: 0.875rem; color: var(--plancia-danger)">
              {{ labels.unknownType(w.type) }}
            </div>
          </WindowFrame>

          <div v-if="!store.visible.length" class="plancia__empty">
            <slot name="empty">
              <div>
                <p>{{ labels.empty }}</p>
                <p v-if="store.minimizedList.length">
                  {{ labels.minimizedHint(store.minimizedList.length) }}
                </p>
                <p v-else>{{ labels.openHint }}</p>
              </div>
            </slot>
          </div>
        </div>

        <footer v-if="store.minimizedList.length" class="plancia__footer">
          <span class="plancia__footer-label">{{ labels.minimizedLabel }}</span>
          <span v-for="w in store.minimizedList" :key="w.id" class="plancia__chip">
            <button type="button" class="plancia__chip-name" :title="labels.restore" @click="store.restore(w.id)">
              {{ w.title || '—' }}
            </button>
            <button type="button" class="plancia__chip-close" :title="labels.close" :aria-label="labels.close" @click="store.close(w.id)">
              ✕
            </button>
          </span>
        </footer>
      </div>

      <slot name="sidebar-right" />
    </div>

    <slot name="sidebar-bottom" />
  </div>
</template>
