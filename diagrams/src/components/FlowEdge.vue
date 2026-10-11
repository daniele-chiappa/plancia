<script setup lang="ts">
import { computed } from 'vue'
import { edgePath, type LaidEdge } from '../layout/layout'
import { LINE_HEIGHT } from '../layout/shapes'

// An edge of a flow or a tree, along the points the layout gave it (Vue
// Flow's own paths would ignore them), with its label on a small box.
const props = defineProps<{ data: { edge: LaidEdge; marker: string } }>()

const e = computed(() => props.data.edge)
const d = computed(() => edgePath(e.value.points))
const box = computed(() =>
  e.value.labelAt
    ? { x: e.value.labelAt.x - e.value.labelW / 2, y: e.value.labelAt.y - e.value.labelH / 2 }
    : null,
)
</script>

<template>
  <g class="pd-edge" :data-style="e.style">
    <path class="pd-edge__path" :d="d" :marker-end="`url(#${data.marker})`" />
    <g v-if="box" class="pd-edge__label">
      <rect :x="box.x" :y="box.y" :width="e.labelW" :height="e.labelH" rx="3" />
      <text text-anchor="middle">
        <tspan v-for="(line, i) in e.labelLines" :key="i" :x="e.labelAt!.x" :y="box.y + 2 + LINE_HEIGHT * (i + 0.72)">
          {{ line }}
        </tspan>
      </text>
    </g>
  </g>
</template>
