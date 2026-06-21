<script setup lang="ts">
import { watch } from 'vue'

const props = defineProps<{ focus?: string; depth?: number }>()
const emit = defineEmits<{ title: [string] }>()

watch(
  () => props.focus,
  (f) => emit('title', f ? `↳ ${f}` : 'Grafico'),
  { immediate: true },
)
</script>

<template>
  <div style="padding: 1rem">
    <p><strong>Grafico (demo)</strong></p>
    <p style="color: #64748b">focus: {{ focus ?? '—' }} · depth: {{ depth ?? 1 }}</p>
  </div>
</template>
