<script setup lang="ts">
import { computed } from 'vue'
import type { GraphNode } from '@vue-flow/core'
import { curved, edgePath, type Box, type LaidEdge, type Point } from '../layout/layout'
import { LINE_HEIGHT } from '../layout/shapes'

// An edge of the editor: it follows its nodes while they are dragged, so
// its path comes from where they are now, not from the layout's points.
const props = defineProps<{
  sourceNode: GraphNode
  targetNode: GraphNode
  data: { edge: LaidEdge; marker: string; selected?: boolean }
}>()

const box = (n: GraphNode): Box => ({
  x: n.computedPosition.x,
  y: n.computedPosition.y,
  w: n.dimensions.width,
  h: n.dimensions.height,
})

const points = computed<Point[]>(() => {
  const a = box(props.sourceNode)
  if (props.sourceNode.id === props.targetNode.id) {
    // An edge to itself: a loop over the top right corner.
    const r = { x: a.x + a.w, y: a.y + a.h / 2 }
    return [r, { x: r.x + 36, y: r.y }, { x: r.x + 36, y: a.y - 28 }, { x: a.x + a.w / 2, y: a.y - 28 }, { x: a.x + a.w / 2, y: a.y }]
  }
  return curved(a, box(props.targetNode), props.data.edge.bend)
})
const d = computed(() => edgePath(points.value))
const mid = computed(() => {
  const p = points.value
  // The middle of the curve, close enough: between its two inner points.
  const a = p[Math.floor((p.length - 1) / 2)]!
  const b = p[Math.ceil((p.length - 1) / 2)]!
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
})
const e = computed(() => props.data.edge)
</script>

<template>
  <g class="pd-edge" :data-style="e.style" :data-selected="data.selected ? '' : undefined">
    <path class="pd-edge__hit" :d="d" />
    <path class="pd-edge__path" :d="d" :marker-end="`url(#${data.marker})`" />
    <g v-if="e.labelLines.length" class="pd-edge__label">
      <rect :x="mid.x - e.labelW / 2" :y="mid.y - e.labelH / 2" :width="e.labelW" :height="e.labelH" rx="3" />
      <text text-anchor="middle">
        <tspan
          v-for="(line, i) in e.labelLines"
          :key="i"
          :x="mid.x"
          :y="mid.y - e.labelH / 2 + 2 + LINE_HEIGHT * (i + 0.72)"
        >
          {{ line }}
        </tspan>
      </text>
    </g>
  </g>
</template>
