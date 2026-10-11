<script setup lang="ts">
import { computed, ref } from 'vue'
import FlowDiagram from './FlowDiagram.vue'
import MermaidDiagram from './MermaidDiagram.vue'
import { parseDiagram } from '../model/parse'
import { diagramText } from '../model/text'
import type { Diagram, DiagramProblem } from '../model/types'
import { flowGraph, treeGraph } from '../layout/graph'
import type { LaidNode } from '../layout/layout'
import { DEFAULT_DIAGRAM_LABELS, type DiagramLabels } from '../labels'
import { linkTarget, type DiagramLinkEvent } from '../links'

/**
 * DiagramView — a diagram of the format (ADR-036 of gosidian), drawn from
 * its YAML (`source`) or from a diagram already read (`diagram`). A flow
 * and a tree are drawn by Vue Flow, a mind map and a fishbone by Mermaid;
 * the other kinds show their text until they are drawn too. What is wrong
 * in the YAML is listed above the drawing, which leaves those parts out.
 * A link of the diagram is an event: the page decides what it opens. The
 * slot `actions` puts the page's own buttons beside the zoom ones.
 */
const props = withDefaults(
  defineProps<{
    source?: string
    diagram?: Diagram | null
    labels?: Partial<DiagramLabels>
    /** The tallest the drawing of a flow or a tree may be, in px. */
    maxHeight?: number
  }>(),
  { source: '', diagram: undefined, labels: () => ({}), maxHeight: 560 },
)
const emit = defineEmits<{ link: [link: DiagramLinkEvent] }>()

const words = computed<DiagramLabels>(() => ({ ...DEFAULT_DIAGRAM_LABELS, ...props.labels }))
const read = computed<{ diagram: Diagram | null; problems: DiagramProblem[] }>(() =>
  props.diagram !== undefined ? { diagram: props.diagram, problems: [] } : parseDiagram(props.source),
)
const d = computed(() => read.value.diagram)
const text = computed(() => diagramText(d.value))
const graph = computed(() => {
  const x = d.value
  if (x?.kind === 'flow') return flowGraph(x)
  if (x?.kind === 'tree') return treeGraph(x)
  return null
})
const drawing = ref<{ svg: () => string | null; zoomIn?: () => void; zoomOut?: () => void; fit?: () => void } | null>(null)
/** Whether this kind is drawn (else its text is shown). */
const drawable = computed(() => !!graph.value || d.value?.kind === 'mindmap' || d.value?.kind === 'fishbone')

function openNode(n: LaidNode) {
  const l = linkTarget(n.link, n.label)
  if (l) emit('link', l)
}

defineExpose({
  /** The drawing as an SVG file, or null when nothing is drawn (yet). */
  exportSVG: (): string | null => drawing.value?.svg() ?? null,
  /** The diagram said in words. */
  text,
  /** Whether the diagram is drawn: false for a kind shown as its text, or one that does not read. */
  drawable,
})
</script>

<template>
  <figure class="plancia-diagram" :data-kind="d?.kind">
    <div v-if="d?.title || graph || $slots.actions" class="plancia-diagram__head">
      <figcaption v-if="d?.title" class="plancia-diagram__title">{{ d.title }}</figcaption>
      <div class="plancia-diagram__tools">
        <template v-if="graph">
          <button type="button" :title="words.zoomIn" :aria-label="words.zoomIn" @click="drawing?.zoomIn?.()">+</button>
          <button type="button" :title="words.zoomOut" :aria-label="words.zoomOut" @click="drawing?.zoomOut?.()">−</button>
          <button type="button" :title="words.fit" :aria-label="words.fit" @click="drawing?.fit?.()">⤢</button>
        </template>
        <!-- The page's own actions on the diagram (its code, an export). -->
        <slot name="actions" :drawable="drawable" />
      </div>
    </div>
    <div v-if="read.problems.length" class="plancia-diagram__problems" role="note">
      {{ words.problems }}
      <ul>
        <li v-for="(p, i) in read.problems" :key="i">
          <template v-if="p.line">{{ words.line }} {{ p.line }}: </template>{{ p.message }}
        </li>
      </ul>
    </div>
    <template v-if="d">
      <FlowDiagram
        v-if="graph"
        ref="drawing"
        :graph="graph"
        :fixed="d.layout"
        :tree="d.kind === 'tree'"
        :labels="words"
        :max-height="maxHeight"
        :title="d.title"
        :description="text"
        @open="openNode"
      />
      <MermaidDiagram
        v-else-if="d.kind === 'mindmap' || d.kind === 'fishbone'"
        ref="drawing"
        :diagram="d"
        :labels="words"
        :title="d.title"
        :description="text"
        @open="(l) => emit('link', l)"
      />
      <div v-else class="plancia-diagram__pending">
        <p>{{ words.pending }}</p>
        <p>{{ text }}</p>
      </div>
      <p class="plancia-diagram__alt">{{ text }}</p>
    </template>
  </figure>
</template>
