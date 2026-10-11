<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import type { LaidGroup } from '../layout/layout'

// A group of a flow: a box behind its nodes, its label at the top left. It
// has handles because an edge may join a group.
defineProps<{ data: { group: LaidGroup } }>()
</script>

<template>
  <div class="pd-group" :style="{ width: `${data.group.w}px`, height: `${data.group.h}px` }">
    <span class="pd-group__label">{{ data.group.label }}</span>
    <Handle type="target" :position="Position.Top" :connectable="false" />
    <Handle type="source" :position="Position.Bottom" :connectable="false" />
  </div>
</template>
