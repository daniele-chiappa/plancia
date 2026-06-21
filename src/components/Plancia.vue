<script setup lang="ts">
/**
 * Plancia — niri-style horizontal strip of tiled windows with scroll-snap, plus
 * a horizontally-scrollable footer of minimized windows. Generic: the
 * type→component `registry` decides what each window renders.
 *
 * Abstracted from the products-dc and gosidian "WindowManager" implementations,
 * with all app-specific concerns (Tailwind tokens, i18n, lucide icons, module
 * label/tone maps, domain buttons) lifted out into props/slots.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watchEffect } from 'vue'
import '../style.css'
import WindowFrame from './WindowFrame.vue'
import { useWindowsStore } from '../store/windows'
import { OPEN_WINDOW, CAN_OPEN_TYPE } from '../composables/openWindow'
import {
  DEFAULT_LABELS,
  type PlanciaLabels,
  type WindowInstance,
  type WindowRegistry,
  type WindowWidth,
} from '../types'

const props = defineProps<{
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
  /** Optional class to add to a tag/badge, derived from its `tone`. */
  resolveTone?: (tone?: string) => string
}>()

const store = useWindowsStore()
const labels = computed<PlanciaLabels>(() => ({ ...DEFAULT_LABELS, ...props.labels }))

// Apply (and keep in sync) the width configuration from props.
watchEffect(() => store.configure({ widthCycle: props.widthCycle, defaultWidth: props.defaultWidth }))

function foreignLabel(w: WindowInstance): string | null {
  if (!props.nativeType || w.type === props.nativeType) return null
  return props.moduleLabel ? props.moduleLabel(w.type) : w.type
}

const stripEl = ref<HTMLElement | null>(null)

// Nested content opens sibling windows without prop-drilling.
provide(OPEN_WINDOW, (spec) => store.open(spec))
// A tag is clickable only if its window-type is registered in this plancia.
provide(CAN_OPEN_TYPE, (type: string) => !!props.registry[type])

// Bring the focused window fully into view (horizontal scroll).
watchEffect(() => {
  const id = store.focusedId
  if (!id) return
  nextTick(() => {
    stripEl.value
      ?.querySelector<HTMLElement>(`[data-win-id="${id}"]`)
      ?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' })
  })
})

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
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="plancia">
    <div ref="stripEl" class="plancia__strip">
      <WindowFrame
        v-for="w in store.visible"
        :key="w.id"
        :win="w"
        :foreign-label="foreignLabel(w)"
        :labels="labels"
        :resolve-tone="resolveTone"
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
</template>
