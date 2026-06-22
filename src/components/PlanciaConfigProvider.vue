<script setup lang="ts">
/**
 * PlanciaConfigProvider — applies a PlanciaConfig to its subtree. It sets the
 * theme CSS vars on its own wrapper (scoped) and provides the reactive config so
 * descendants can read behavior defaults / labels (precedence: prop › config ›
 * built-in). By default it ALSO mirrors the theme onto `:root` (`global`), so
 * teleported content (dialogs, sidebar backdrops) picks it up; set `:global="false"`
 * for pure scoped theming (multiple themes on one page). No Pinia.
 */
import { computed, onBeforeUnmount, provide, watchEffect } from 'vue'
import '../style.css'
import { PLANCIA_CONFIG, themeToStyle } from '../config/usePlanciaConfig'
import type { PlanciaConfig } from '../config/types'

const props = withDefaults(
  defineProps<{
    config?: PlanciaConfig
    /** Also apply the theme to `:root` (covers teleported dialogs). Default true. */
    global?: boolean
    /** Wrapper element tag. */
    tag?: string
  }>(),
  { config: () => ({}), global: true, tag: 'div' },
)

const cfg = computed<PlanciaConfig>(() => props.config)
provide(PLANCIA_CONFIG, cfg)

const themeStyle = computed(() => themeToStyle(props.config.theme))

// Global mirror onto :root for teleported content. Cleaned up reactively.
let applied: string[] = []
function clearGlobal() {
  if (typeof document === 'undefined') return
  for (const k of applied) document.documentElement.style.removeProperty(k)
  applied = []
}
watchEffect(() => {
  if (typeof document === 'undefined') return
  clearGlobal()
  if (!props.global) return
  for (const [k, v] of Object.entries(themeStyle.value)) {
    document.documentElement.style.setProperty(k, v)
    applied.push(k)
  }
})
onBeforeUnmount(clearGlobal)
</script>

<template>
  <component :is="tag" class="plancia-config" :style="themeStyle">
    <slot />
  </component>
</template>
