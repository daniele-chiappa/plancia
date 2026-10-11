<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { LaidNode } from '../layout/layout'
import type { StepState } from '../pipeline/types'

// A node of a pipeline on its drawing: its id over its type, the colour of
// where the type comes from (a plugin's), and the state of the node in the
// run shown. The trigger is a pill. The handles join nodes in the editor.
const props = defineProps<{
  data: {
    node: LaidNode
    id: string
    use: string
    trigger: boolean
    plugin: boolean
    unknown: boolean
    step?: StepState
    stepLabel?: string
    editable?: boolean
    selected?: boolean
  }
}>()

const n = computed(() => props.data.node)
</script>

<template>
  <div
    class="pd-pnode"
    :data-trigger="data.trigger ? '' : undefined"
    :data-plugin="data.plugin ? '' : undefined"
    :data-unknown="data.unknown ? '' : undefined"
    :data-status="data.step?.status"
    :data-editable="data.editable ? '' : undefined"
    :data-selected="data.selected ? '' : undefined"
    :style="{ width: `${n.w}px`, height: `${n.h}px` }"
    :title="data.step?.error || undefined"
  >
    <span class="pd-pnode__id">{{ data.id }}</span>
    <span class="pd-pnode__use">{{ data.use }}</span>
    <span v-if="data.step" class="pd-pnode__status" :aria-label="data.stepLabel">
      <span class="pd-pnode__dot" aria-hidden="true" />{{ data.stepLabel }}<template v-if="(data.step.attempt ?? 1) > 1"> ×{{ data.step.attempt }}</template>
    </span>
    <Handle v-if="!data.trigger" type="target" :position="Position.Top" :connectable="!!data.editable" />
    <Handle type="source" :position="Position.Bottom" :connectable="!!data.editable" />
  </div>
</template>
