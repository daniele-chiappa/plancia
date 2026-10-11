<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { LaidNode } from '../layout/layout'
import { labelTop, shapePaths } from '../layout/shapes'
import type { Direction } from '../model/types'

// A node of a flow or a tree: its shape as SVG behind its label. A node
// with a link is a button over the whole shape. The handles are only there
// for Vue Flow to attach edges; the edges draw their own paths.
const props = defineProps<{
  data: { node: LaidNode; direction: Direction; tree: boolean; open: (n: LaidNode) => void; openLabel: string }
}>()

const n = computed(() => props.data.node)
const paths = computed(() => shapePaths(n.value.shape, n.value.w, n.value.h))
const top = computed(() => labelTop(n.value.shape, n.value.h, n.value.lines.length))
const ends = computed((): [Position, Position] => {
  switch (props.data.direction) {
    case 'LR':
      return [Position.Left, Position.Right]
    case 'RL':
      return [Position.Right, Position.Left]
    case 'BT':
      return [Position.Bottom, Position.Top]
    default:
      return [Position.Top, Position.Bottom]
  }
})
</script>

<template>
  <div
    class="pd-node"
    :data-shape="n.shape"
    :data-class="n.cls || undefined"
    :data-link="n.link ? '' : undefined"
    :data-root="data.tree && n.depth === 0 ? '' : undefined"
    :style="{ width: `${n.w}px`, height: `${n.h}px` }"
  >
    <svg class="pd-node__shape" :width="n.w" :height="n.h" aria-hidden="true">
      <path class="pd-node__fill" :d="paths[0]" />
      <path v-if="paths[1]" class="pd-node__line" :d="paths[1]" />
    </svg>
    <div class="pd-node__label" :style="{ top: `${top}px` }" aria-hidden="true">
      <span v-for="(line, i) in n.lines" :key="i">{{ line }}</span>
    </div>
    <button
      v-if="n.link"
      type="button"
      class="pd-node__open nodrag nopan"
      :aria-label="`${data.openLabel}: ${n.label}`"
      :title="n.link"
      @click.stop="data.open(n)"
    />
    <Handle type="target" :position="ends[0]" :connectable="false" />
    <Handle type="source" :position="ends[1]" :connectable="false" />
  </div>
</template>
