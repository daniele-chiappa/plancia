<script setup lang="ts">
/**
 * PlanciaLayout — a generic edge-and-center layout shell. Arranges up to four
 * edge regions around a content area: `top`/`bottom` span the full width,
 * `left`/`right` flank the centre (the default slot). Drop a <PlanciaSidebar>
 * (or any content — a toolbar, a status bar) into an edge slot.
 *
 * The shell and its middle band are `position: relative`, so `overlay`/`floating`
 * sidebars placed in the slots anchor correctly. Fills its parent — give the
 * parent a height. Independent of the window manager: use it for any app, or wrap
 * a <Plancia> in the centre.
 */
import '../style.css'
</script>

<template>
  <div class="plancia-layout">
    <slot name="top" />

    <div class="plancia-layout__mid">
      <slot name="left" />
      <div class="plancia-layout__main">
        <slot />
      </div>
      <slot name="right" />
    </div>

    <slot name="bottom" />
  </div>
</template>
