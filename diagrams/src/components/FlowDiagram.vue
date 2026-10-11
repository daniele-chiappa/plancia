<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue'
import { VueFlow, useVueFlow, type Edge, type Node } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import FlowNode from './FlowNode.vue'
import FlowGroup from './FlowGroup.vue'
import FlowEdge from './FlowEdge.vue'
import { layoutGraph, type Laid, type LaidNode } from '../layout/layout'
import { createMeasure, type Measure } from '../layout/shapes'
import type { Graph } from '../layout/graph'
import type { LayoutPoint } from '../model/types'
import type { DiagramLabels } from '../labels'
import { flowToSVG } from '../svg/flowSvg'
import { readPalette } from '../theme'

// A flow or a tree drawn by Vue Flow, read-only: laid out by dagre once the
// font is known, fitted to the width, panned by dragging and zoomed with
// the buttons of DiagramView (the wheel scrolls the page, as everywhere
// else in a note).
const props = defineProps<{
  graph: Graph
  fixed?: Record<string, LayoutPoint>
  tree?: boolean
  labels: DiagramLabels
  maxHeight?: number
  title?: string
  description?: string
}>()
const emit = defineEmits<{ open: [node: LaidNode] }>()

const flowId = `plancia-diagram-${useId()}`
const marker = `${flowId}-arrow`
const root = ref<HTMLElement | null>(null)
const measure = shallowRef<Measure | null>(null)
const width = ref(0)

const laid = computed<Laid | null>(() => (measure.value ? layoutGraph(props.graph, measure.value, props.fixed) : null))

const nodes = computed<Node[]>(() => {
  const l = laid.value
  if (!l) return []
  const fixedNode = { draggable: false, selectable: false, connectable: false, focusable: false }
  return [
    ...l.groups.map((g) => ({
      id: g.id,
      type: 'pdgroup',
      position: { x: g.x, y: g.y },
      data: { group: g },
      zIndex: -1,
      ...fixedNode,
    })),
    ...l.nodes.map((n) => ({
      id: n.id,
      type: 'shape',
      position: { x: n.x, y: n.y },
      data: {
        node: n,
        direction: props.graph.direction,
        tree: !!props.tree,
        open: (x: LaidNode) => emit('open', x),
        openLabel: props.labels.open,
      },
      ...fixedNode,
    })),
  ]
})

const edges = computed<Edge[]>(() =>
  (laid.value?.edges ?? []).map((e) => ({
    id: e.id,
    source: e.from,
    target: e.to,
    type: 'routed',
    data: { edge: e, marker },
    selectable: false,
    focusable: false,
    updatable: false,
  })),
)

// The box is as tall as the drawing at the scale that fits the width.
const height = computed(() => {
  const l = laid.value
  if (!l) return 120
  const scale = width.value > 0 ? Math.min(1, width.value / l.width) : 1
  return Math.max(80, Math.min(props.maxHeight ?? 560, Math.ceil(l.height * scale)))
})

const { fitView, zoomIn, zoomOut, onNodesInitialized } = useVueFlow(flowId)
const fit = () => fitView({ padding: 0.02, maxZoom: 1 })
onNodesInitialized(() => fit())

let resize: ResizeObserver | null = null
onMounted(() => {
  const el = root.value!
  measure.value = createMeasure(getComputedStyle(el).fontFamily)
  width.value = el.clientWidth
  if (typeof ResizeObserver !== 'undefined') {
    resize = new ResizeObserver(() => {
      if (el.clientWidth !== width.value) {
        width.value = el.clientWidth
        requestAnimationFrame(fit)
      }
    })
    resize.observe(el)
  }
})
onBeforeUnmount(() => resize?.disconnect())

defineExpose({
  zoomIn: () => zoomIn(),
  zoomOut: () => zoomOut(),
  fit,
  /** The drawing as an SVG file, its colours those of the page now. */
  svg: (): string | null =>
    laid.value
      ? flowToSVG(laid.value, readPalette(root.value), { title: props.title, description: props.description }, props.tree)
      : null,
})
</script>

<template>
  <div ref="root" class="plancia-diagram__flow" :style="{ height: `${height}px` }">
    <svg class="plancia-diagram__defs" width="0" height="0" aria-hidden="true">
      <defs>
        <marker
          :id="marker"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path class="pd-arrow" d="M0 0L10 5L0 10z" />
        </marker>
      </defs>
    </svg>
    <VueFlow
      v-if="laid"
      :id="flowId"
      :nodes="nodes"
      :edges="edges"
      :nodes-draggable="false"
      :nodes-connectable="false"
      :elements-selectable="false"
      :nodes-focusable="false"
      :edges-focusable="false"
      :zoom-on-scroll="false"
      :zoom-on-double-click="false"
      :pan-on-scroll="false"
      :prevent-scrolling="false"
      :min-zoom="0.2"
      :max-zoom="2"
    >
      <template #node-shape="p">
        <FlowNode :data="p.data" />
      </template>
      <template #node-pdgroup="p">
        <FlowGroup :data="p.data" />
      </template>
      <template #edge-routed="p">
        <FlowEdge :data="p.data" />
      </template>
    </VueFlow>
  </div>
</template>
