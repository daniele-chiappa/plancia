<script setup lang="ts">
/**
 * Root component of the plancia (niri-style scrollable tiling window manager).
 *
 * SCAFFOLD: la chrome reale (WindowManager + WindowFrame, ciclo larghezza,
 * footer minimizzate, sync URL) viene portata dai due sorgenti in fase di
 * astrazione — vedi memory/architecture.md e il plan 20260621. Per ora il
 * componente espone solo la shape del registry e uno slot.
 */
import type { Component } from 'vue'

defineProps<{
  /** Registry tipo-finestra → componente Vue (async lazy nei sorgenti). */
  registry?: Record<string, Component>
}>()
</script>

<template>
  <div class="plancia">
    <slot>
      <p class="plancia__placeholder">
        plancia — scaffold. Window manager non ancora portato dai sorgenti.
      </p>
    </slot>
  </div>
</template>

<style scoped>
.plancia {
  display: flex;
  height: 100%;
  overflow-x: auto;
}
.plancia__placeholder {
  margin: auto;
  opacity: 0.6;
  font-family: system-ui, sans-serif;
}
</style>
