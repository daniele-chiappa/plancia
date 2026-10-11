<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { Diagram, DiagramBranch } from '../model/types'
import type { DiagramLabels } from '../labels'
import { linkTarget, type DiagramLinkEvent } from '../links'
import { toMermaid } from '../mermaid/convert'
import { renderMermaid } from '../mermaid/render'
import { readPalette } from '../theme'
import { useThemeChange } from '../composables'

// A mind map or a fishbone drawn by Mermaid, again whenever the diagram or
// the page's theme changes. Mermaid's drawing is static, so the links of
// its branches are listed under it.
const props = defineProps<{ diagram: Diagram; labels: DiagramLabels; title?: string; description?: string }>()
const emit = defineEmits<{ open: [link: DiagramLinkEvent] }>()

const root = ref<HTMLElement | null>(null)
const svg = ref('')
const error = ref('')
const theme = useThemeChange()
const source = computed(() => toMermaid(props.diagram))

const links = computed(() => {
  const out: DiagramLinkEvent[] = []
  const walk = (b: DiagramBranch | undefined) => {
    if (!b) return
    const l = b.link ? linkTarget(b.link, b.label) : null
    if (l) out.push(l)
    b.children.forEach(walk)
  }
  walk(props.diagram.root)
  return out
})

let run = 0
async function draw() {
  const mine = ++run
  try {
    const out = await renderMermaid(source.value, readPalette(root.value))
    if (mine !== run) return
    svg.value = out
    error.value = ''
  } catch (e) {
    if (mine !== run) return
    svg.value = ''
    error.value = e instanceof Error ? e.message : String(e)
  }
}
onMounted(draw)
watch([source, theme], draw)

/** The drawing as an SVG file, with a title and a description when given. */
function exportSvg(): string | null {
  if (!svg.value) return null
  const meta =
    (props.title ? `<title>${escapeXml(props.title)}</title>` : '') +
    (props.description ? `<desc>${escapeXml(props.description)}</desc>` : '')
  return svg.value.replace(/<svg\b[^>]*>/, (open) => open + meta) + '\n'
}

function escapeXml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

defineExpose({ svg: exportSvg })
</script>

<template>
  <div ref="root">
    <div v-if="svg" class="plancia-diagram__mermaid" aria-hidden="true" v-html="svg" />
    <p v-else-if="error" class="plancia-diagram__status" role="alert">{{ labels.failed }} {{ error }}</p>
    <p v-else class="plancia-diagram__status">{{ labels.loading }}</p>
    <ul v-if="links.length" class="plancia-diagram__links">
      <li>{{ labels.links }}</li>
      <li v-for="(l, i) in links" :key="i">
        <button type="button" :title="l.target" @click="emit('open', l)">{{ l.label }}</button>
      </li>
    </ul>
  </div>
</template>
