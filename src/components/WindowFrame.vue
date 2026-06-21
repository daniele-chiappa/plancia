<script setup lang="ts">
/**
 * WindowFrame — chrome around one plancia window. Content-agnostic: the body is
 * the default <slot/>. Dependency-free icons (inline SVG) and CSS-variable
 * styling. Extra per-window buttons go through the `actions` slot (this is how
 * domain-specific actions like gosidian's ego-graph button stay OUT of the lib).
 */
import { computed, inject } from 'vue'
import { useWindowsStore } from '../store/windows'
import { OPEN_WINDOW, CAN_OPEN_TYPE } from '../composables/openWindow'
import { DEFAULT_LABELS, type PlanciaLabels, type WindowInstance, type WindowTag } from '../types'

const props = defineProps<{
  win: WindowInstance
  /** Module label when the window is cross-module: header shows "[label]: title". */
  foreignLabel?: string | null
  labels?: PlanciaLabels
  /** Optional class to add to a tag/badge, derived from its `tone`. */
  resolveTone?: (tone?: string) => string
}>()

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
</script>

<template>
  <section
    :data-win-id="win.id"
    :data-width="win.width"
    class="plancia-window"
    :class="{ 'plancia-window--focused': focused }"
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
  </section>
</template>
