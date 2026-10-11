<script setup lang="ts">
import { computed, ref } from 'vue'
import PipelineCanvas, { type PipelineSelection } from './PipelineCanvas.vue'
import { readPipeline } from '../pipeline/read'
import { TRIGGER_ID, type NodeTypeInfo, type RunState } from '../pipeline/types'
import { DEFAULT_PIPELINE_LABELS, type PipelineLabels } from '../labels'

/**
 * PipelineView — a ```pipeline block of gosidian drawn, read-only: the
 * trigger, the nodes and what they wait for, at the places of layout:.
 * With `run`, each node shows how it went, and a click on one says its
 * status, error and output. The slot `actions` puts the page's buttons
 * beside the zoom ones.
 */
const props = withDefaults(
  defineProps<{
    source: string
    catalog?: NodeTypeInfo[]
    run?: RunState | null
    labels?: Partial<PipelineLabels>
    height?: number
  }>(),
  { catalog: () => [], run: null, labels: () => ({}), height: 360 },
)

const words = computed<PipelineLabels>(() => ({
  ...DEFAULT_PIPELINE_LABELS,
  ...props.labels,
  triggers: { ...DEFAULT_PIPELINE_LABELS.triggers, ...props.labels.triggers },
  statuses: { ...DEFAULT_PIPELINE_LABELS.statuses, ...props.labels.statuses },
}))
const read = computed(() => readPipeline(props.source))
const selection = ref<PipelineSelection>(null)
const canvas = ref<{ fit: () => void; zoomIn: () => void; zoomOut: () => void } | null>(null)
const step = computed(() => {
  const s = selection.value
  return s?.kind === 'node' && s.id !== TRIGGER_ID ? { id: s.id, state: props.run?.steps[s.id] } : null
})
const outputText = (o: unknown) => (o === undefined || o === null ? '' : typeof o === 'string' ? o : JSON.stringify(o, null, 2))
</script>

<template>
  <figure class="plancia-diagram plancia-pipeline" data-kind="pipeline">
    <div class="plancia-diagram__head">
      <div class="plancia-diagram__tools">
        <template v-if="read.pipeline">
          <button type="button" :title="words.zoomIn" :aria-label="words.zoomIn" @click="canvas?.zoomIn()">+</button>
          <button type="button" :title="words.zoomOut" :aria-label="words.zoomOut" @click="canvas?.zoomOut()">−</button>
          <button type="button" :title="words.fit" :aria-label="words.fit" @click="canvas?.fit()">⤢</button>
        </template>
        <slot name="actions" />
      </div>
    </div>
    <div v-if="read.problems.length" class="plancia-diagram__problems" role="note">
      {{ words.problems }}
      <ul>
        <li v-for="(p, i) in read.problems" :key="i"><template v-if="p.line">{{ words.line }} {{ p.line }}: </template>{{ p.message }}</li>
      </ul>
    </div>
    <PipelineCanvas
      v-if="read.pipeline"
      ref="canvas"
      v-model:selection="selection"
      :pipeline="read.pipeline"
      :catalog="catalog"
      :run="run"
      :labels="words"
      :height="height"
    />
    <div v-if="step && step.state" class="pd-pipeline__run" data-run-step>
      <strong>{{ step.id }}</strong> — {{ words.statuses[step.state.status] }}
      <p v-if="step.state.error" class="pd-pipeline__error">{{ step.state.error }}</p>
      <pre v-if="outputText(step.state.output)" class="pd-pipeline__output">{{ outputText(step.state.output) }}</pre>
    </div>
  </figure>
</template>
