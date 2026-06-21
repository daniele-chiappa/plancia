<script setup lang="ts">
import { onMounted } from 'vue'
const emit = defineEmits<{ title: [string] }>()
onMounted(() => emit('title', 'Impostazioni'))
</script>

<template>
  <div style="padding: 1rem">
    <p><strong>Impostazioni (demo singleton)</strong></p>
    <p style="color: #64748b">Una sola istanza grazie alla de-dup per <code>key</code>.</p>
  </div>
</template>
