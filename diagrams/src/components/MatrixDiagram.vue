<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { Diagram } from '../model/types'
import type { DiagramLabels } from '../labels'
import { linkTarget, type DiagramLinkEvent } from '../links'
import { matrixToSVG, QUADRANT_PLOT } from '../svg/matrixSvg'
import { createMeasure } from '../layout/shapes'
import { readPalette, type Palette } from '../theme'
import { useThemeChange } from '../composables'

// A matrix drawn by the package (matrixSvg), again whenever the diagram or
// the page's theme changes. A point with a link opens it; in the editor
// (`editable`) a point is selected by a click and dragged to its place.
const props = defineProps<{
  diagram: Diagram
  labels: DiagramLabels
  title?: string
  description?: string
  editable?: boolean
  selected?: number | null
}>()
const emit = defineEmits<{
  open: [link: DiagramLinkEvent]
  select: [index: number | null]
  move: [index: number, x: number, y: number]
}>()

const root = ref<HTMLElement | null>(null)
const palette = ref<Palette | null>(null)
const theme = useThemeChange()
const m = computed(() => props.diagram.matrix)
const quadrants = computed(() => !!m.value && m.value.rows.length === 0)

function readColors() {
  palette.value = readPalette(root.value)
}
onMounted(readColors)
watch(theme, readColors)

const measure = computed(() => createMeasure(palette.value?.fontFamily))
const svg = computed(() =>
  m.value && palette.value
    ? matrixToSVG(m.value, palette.value, measure.value, {}, { selected: props.editable ? (props.selected ?? null) : null, hit: true })
    : '',
)

const links = computed(() =>
  (m.value?.items ?? []).flatMap((it) => {
    const l = it.link ? linkTarget(it.link, it.label) : null
    return l ? [l] : []
  }),
)

// --- a point: click and drag ---

let drag: { index: number; el: SVGGElement; x0: number; y0: number; scale: number; dx: number; dy: number } | null = null

function itemAt(e: PointerEvent): { index: number; el: SVGGElement } | null {
  const el = (e.target as Element | null)?.closest?.('[data-item]') as SVGGElement | null
  return el ? { index: Number(el.dataset.item), el } : null
}

function onDown(e: PointerEvent) {
  const hit = itemAt(e)
  if (!hit) {
    if (props.editable) emit('select', null)
    return
  }
  const box = root.value?.querySelector('svg')?.getBoundingClientRect()
  const vb = root.value?.querySelector('svg')?.viewBox.baseVal
  const scale = box && vb && box.width > 0 ? vb.width / box.width : 1
  drag = { ...hit, x0: e.clientX, y0: e.clientY, scale, dx: 0, dy: 0 }
  if (props.editable) {
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    e.preventDefault()
  }
}

function onMove(e: PointerEvent) {
  if (!drag || !props.editable || !quadrants.value) return
  drag.dx = (e.clientX - drag.x0) * drag.scale
  drag.dy = (e.clientY - drag.y0) * drag.scale
  drag.el.setAttribute('transform', `translate(${drag.dx} ${drag.dy})`)
}

function onUp() {
  const d = drag
  drag = null
  if (!d) return
  const it = m.value?.items[d.index]
  if (!it) return
  if (props.editable && quadrants.value && Math.hypot(d.dx, d.dy) > 3) {
    const r2 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 100) / 100
    const x = r2(it.x + d.dx / QUADRANT_PLOT.w)
    const y = r2(it.y - d.dy / QUADRANT_PLOT.h)
    d.el.removeAttribute('transform')
    emit('select', d.index)
    emit('move', d.index, x, y)
    return
  }
  d.el.removeAttribute('transform')
  if (props.editable) emit('select', d.index)
  else {
    const l = it.link ? linkTarget(it.link, it.label) : null
    if (l) emit('open', l)
  }
}

defineExpose({
  /** The drawing as an SVG file, with a title and a description when given. */
  svg: (): string | null =>
    m.value ? matrixToSVG(m.value, palette.value ?? readPalette(root.value), measure.value, { title: props.title, description: props.description }) : null,
})
</script>

<template>
  <div ref="root" class="plancia-diagram__matrix" :data-editable="editable ? '' : undefined">
    <div
      v-if="svg"
      class="plancia-diagram__matrix-svg"
      aria-hidden="true"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      v-html="svg"
    />
    <ul v-if="links.length && !editable" class="plancia-diagram__links">
      <li>{{ labels.links }}</li>
      <li v-for="(l, i) in links" :key="i">
        <button type="button" :title="l.target" @click="emit('open', l)">{{ l.label }}</button>
      </li>
    </ul>
  </div>
</template>
