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
import { usePlanciaFocus } from '../composables/usePlanciaFocus'
import { usePlanciaConfig } from '../config/usePlanciaConfig'
import {
  DEFAULT_LABELS,
  type PlanciaLabels,
  type ViewMode,
  type WindowInstance,
  type WindowRegistry,
  type WindowTag,
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
  /** Selector of the element that takes the focus in a window's body, such as
   *  its heading (`usePlanciaFocus`). Omitted, or not drawn yet: the window
   *  itself takes it. */
  focusTarget?: string
  }>(),
  { showViewToggle: true },
)

/** Layout mode. Controlled with `v-model:view-mode`; otherwise an internal ref
 *  that falls back to the config default, then 'strip'. */
const viewModelRaw = defineModel<ViewMode | undefined>('viewMode', { default: undefined })

const emit = defineEmits<{
  /** A window that held the focus went, and no window is left to take it:
   *  the host puts it somewhere (its main, say). */
  'focus-out': []
}>()

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

// Apply (and keep in sync) the width and focus configuration from props (or
// config).
watchEffect(() =>
  store.configure({
    widthCycle: props.widthCycle ?? cfg?.value.components?.window?.defaults?.widthCycle,
    defaultWidth: props.defaultWidth ?? cfg?.value.components?.window?.defaults?.defaultWidth,
    focusTarget: props.focusTarget ?? null,
  }),
)

// Drag-resize knobs (precedence prop › config › builtin).
const minWidthPx = computed(
  () => props.minWidthPx ?? cfg?.value.components?.window?.defaults?.minWidthPx ?? 240,
)
const softMaxDelayMs = computed(
  () => props.softMaxDelayMs ?? cfg?.value.components?.window?.defaults?.softMaxDelayMs ?? 300,
)

/**
 * The events of a window's content, bound to that window when it renders.
 * Not to the focused window when the event comes: a content that opens
 * another window (which takes the focus) and then closes would close the
 * new one (IMP-006).
 */
function windowEvents(id: string) {
  return {
    title: (title: string) => store.setTitle(id, title),
    dirty: (dirty: boolean) => store.setDirty(id, dirty),
    identify: (e: { key: string; props: Record<string, unknown> }) => store.identify(id, e.key, e.props),
    changed: () => store.touch(),
    tags: (tags: WindowTag[]) => store.setTags(id, tags),
    close: () => store.close(id),
  }
}

function foreignLabel(w: WindowInstance): string | null {
  if (!props.nativeType || w.type === props.nativeType) return null
  return props.moduleLabel ? props.moduleLabel(w.type) : w.type
}

/** Close honouring the unsaved-changes guard (same as the window header). */
function closeWindow(w: WindowInstance): void {
  if (w.dirty && !window.confirm(labels.value.unsavedClose)) return
  store.close(w.id)
}

const rootEl = ref<HTMLElement | null>(null)
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

/* --- the focus follows the windows (F-03) --------------------------------- */
const { focusWindow } = usePlanciaFocus()
// How long a window's view may take to draw its focus target.
const FOCUS_WAIT_MS = 1000
// The element that had the focus when each window was opened: the focus goes
// back there when the window goes. Kept here, not in the store, which stays
// free of DOM.
const openers = new Map<string, HTMLElement>()

const focusLost = () => document.activeElement === document.body || document.activeElement === null

/** Whether the focus is in window `id`, on its tab or on its footer chip. */
function holdsFocus(id: string): boolean {
  const a = document.activeElement
  if (!a || !rootEl.value?.contains(a)) return false
  return !!a.closest(`[data-win-id="${id}"], [data-tab-id="${id}"], [data-chip-id="${id}"]`)
}

/** Into window `id`; to the host if it cannot take the focus. */
function focusInto(id: string | null): void {
  if (!id || !store.visible.some((w) => w.id === id)) {
    emit('focus-out')
    return
  }
  void focusWindow(id, { wait: FOCUS_WAIT_MS }).then((ok) => {
    if (!ok && focusLost()) emit('focus-out')
  })
}

/** After the window that held the focus went: back to its opener if it is
 *  still on the page, else into the focused window, else to the host. Only
 *  if the focus is lost: a host that put it somewhere keeps it there. */
function refocus(opener: HTMLElement | undefined): void {
  nextTick(() => {
    if (!focusLost()) return
    if (opener?.isConnected) {
      opener.focus()
      if (document.activeElement === opener) return
    }
    focusInto(store.focusedId)
  })
}

store.$onAction(({ name, args, after }) => {
  if (name === 'open') {
    const a = document.activeElement
    if (a instanceof HTMLElement && a !== document.body) after((id) => void openers.set(id, a))
  } else if (name === 'close' || name === 'minimize') {
    const id = args[0] as string
    const opener = openers.get(id)
    const held = holdsFocus(id)
    after(() => {
      if (name === 'close') openers.delete(id)
      if (held) refocus(opener)
    })
  } else if (name === 'restore') {
    const id = args[0] as string
    // From its chip, which goes: into the window.
    if (holdsFocus(id)) {
      after(() =>
        nextTick(() => {
          if (focusLost()) focusInto(id)
        }),
      )
    }
  } else if (name === 'reset') {
    after(() => openers.clear())
  }
})

function onKey(e: KeyboardEvent) {
  if (!e.altKey) return
  const dir = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
  if (!dir) return
  e.preventDefault()
  // The focus follows only from the plancia (or the page): not from a dialog
  // or a bar of the host.
  const a = document.activeElement
  const ours = !a || a === document.body || !!rootEl.value?.contains(a)
  const was = store.focusedId
  store.focusAdjacent(dir)
  if (ours && store.focusedId && store.focusedId !== was) focusInto(store.focusedId)
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
  <div ref="rootEl" class="plancia">
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
                  v-on="windowEvents(store.focused.id)"
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
              v-on="windowEvents(w.id)"
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
          <span v-for="w in store.minimizedList" :key="w.id" class="plancia__chip" :data-chip-id="w.id">
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
