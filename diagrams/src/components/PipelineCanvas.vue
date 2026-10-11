<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue'
import { VueFlow, useVueFlow, ConnectionMode, type Connection, type Edge, type Node } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import PipelineNode from './PipelineNode.vue'
import FlowEdge from './FlowEdge.vue'
import EditEdge from './EditEdge.vue'
import { pipelineGraph } from '../pipeline/graph'
import { layoutGraph, type Laid } from '../layout/layout'
import { createMeasure, type Measure } from '../layout/shapes'
import { TRIGGER_ID, type NodeTypeInfo, type Pipeline, type RunState } from '../pipeline/types'
import type { PipelineOp } from '../pipeline/edit'
import type { LayoutPosition } from '../edit/edit'
import type { PipelineLabels } from '../labels'

/** What is selected on a pipeline's drawing. */
export type PipelineSelection = { kind: 'node'; id: string } | { kind: 'edge'; from: string; to: string } | null

// A pipeline drawn by Vue Flow: the trigger, the nodes and what they wait
// for, laid out by dagre top to bottom, at the places of layout: where it
// gives some. With a run, each node shows how it went. Editable, its nodes
// drag (the first drag fixes them all), a line from a node's dot to another
// makes the second wait for the first, and a click selects; what the user
// does comes out as operations, and the drawing follows the YAML.
const props = defineProps<{
  pipeline: Pipeline
  catalog?: NodeTypeInfo[]
  run?: RunState | null
  labels: PipelineLabels
  editable?: boolean
  selection?: PipelineSelection
  height: number
}>()
const emit = defineEmits<{ ops: [ops: PipelineOp[]]; 'update:selection': [s: PipelineSelection] }>()

const flowId = `plancia-pipeline-${useId()}`
const marker = `${flowId}-arrow`
const root = ref<HTMLElement | null>(null)
const measure = shallowRef<Measure | null>(null)

const graph = computed(() => {
  const g = pipelineGraph(props.pipeline)
  // A line more for the state of each node in a run.
  if (props.run) for (const n of g.nodes) if (n.id !== TRIGGER_ID) n.label += '\n·'
  return g
})
// A node's id is bold and its type monospaced: wider than the label's
// measure says, and a box at least wide enough for a short name.
const wide = computed<Measure | null>(() => {
  const m = measure.value
  return m ? (t: string) => Math.max(m(t) * 1.15, t.length * 7.4, 92) : null
})
const laid = computed<Laid | null>(() => (wide.value ? layoutGraph(graph.value, wide.value, props.pipeline.layout ?? {}) : null))

const types = computed(() => new Map((props.catalog ?? []).map((t) => [t.type, t])))
const isSelected = (id: string) => props.selection?.kind === 'node' && props.selection.id === id

const nodes = computed<Node[]>(() => {
  const l = laid.value
  if (!l) return []
  const byId = new Map(props.pipeline.nodes.map((n) => [n.id, n]))
  return l.nodes.map((ln) => {
    const trigger = ln.id === TRIGGER_ID
    const pn = byId.get(ln.id)
    const use = trigger ? props.labels.triggers[props.pipeline.trigger.on as keyof PipelineLabels['triggers']] ?? props.pipeline.trigger.on : (pn?.use ?? '')
    const info = types.value.get(pn?.use ?? '')
    const step = trigger ? undefined : props.run?.steps[ln.id]
    return {
      id: ln.id,
      type: 'pnode',
      position: { x: ln.x, y: ln.y },
      draggable: !!props.editable,
      selectable: false,
      connectable: !!props.editable,
      data: {
        node: ln,
        id: trigger ? props.labels.trigger : ln.id,
        use,
        trigger,
        plugin: !!info && info.group !== 'base',
        unknown: !trigger && !!props.catalog?.length && !info,
        step,
        stepLabel: step ? props.labels.statuses[step.status] : undefined,
        editable: props.editable,
        selected: isSelected(ln.id),
      },
    }
  })
})

const edges = computed<Edge[]>(() =>
  (laid.value?.edges ?? []).map((e) => {
    const s = props.selection
    const selected = s?.kind === 'edge' && s.from === e.from && s.to === e.to
    return {
      id: e.id,
      source: e.from,
      target: e.to,
      type: props.editable ? 'live' : 'routed',
      data: { edge: e, marker, selected },
      selectable: false,
      focusable: false,
    }
  }),
)

const { fitView, zoomIn, zoomOut, getNodes, screenToFlowCoordinate, onNodesInitialized } = useVueFlow(flowId)
const fit = () => fitView({ padding: 0.08, maxZoom: 1 })
let fitted = false
onNodesInitialized(() => {
  if (!fitted) fit()
  fitted = true
})

let resize: ResizeObserver | null = null
onMounted(() => {
  const el = root.value!
  measure.value = createMeasure(getComputedStyle(el).fontFamily)
  if (typeof ResizeObserver !== 'undefined') {
    let w = el.clientWidth
    resize = new ResizeObserver(() => {
      if (el.clientWidth !== w) {
        w = el.clientWidth
        requestAnimationFrame(fit)
      }
    })
    resize.observe(el)
  }
})
onBeforeUnmount(() => resize?.disconnect())

/** Every node where it is now: the first drag fixes the layout. */
function onDragStop() {
  const positions: Record<string, LayoutPosition> = {}
  for (const n of getNodes.value) positions[n.id] = { x: n.position.x, y: n.position.y }
  emit('ops', [{ op: 'move', positions }])
}

// A line from a node's dot joins it to the node it is dropped on, on its
// dot or anywhere on its box: the second waits for the first.
let from: string | null = null
let joined = false
function onConnectStart(e: { nodeId?: string }) {
  from = e.nodeId ?? null
  joined = false
}
function join(a: string, b: string) {
  if (a === b || b === TRIGGER_ID) return
  joined = true
  emit('ops', [{ op: 'connect', from: a, to: b }])
}
function onConnect(c: Connection) {
  if (c.source && c.target) join(c.source, c.target)
}
function onConnectEnd(e?: MouseEvent | TouchEvent) {
  const start = from
  from = null
  if (joined || !start || !e) return
  const pt = 'changedTouches' in e ? e.changedTouches[0] : e
  if (!pt) return
  const el = document.elementFromPoint(pt.clientX, pt.clientY)?.closest<HTMLElement>('.vue-flow__node')
  const to = el?.dataset.id
  if (to) join(start, to)
}

function onNodeClick(e: { node: Node }) {
  emit('update:selection', { kind: 'node', id: e.node.id })
}
function onEdgeClick(e: { edge: Edge }) {
  emit('update:selection', { kind: 'edge', from: e.edge.source, to: e.edge.target })
}

/** Where a new node goes: the middle of what is in view. */
function center(): LayoutPosition {
  const r = root.value!.getBoundingClientRect()
  const p = screenToFlowCoordinate({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
  return { x: p.x - 60, y: p.y - 24 }
}

defineExpose({ center, fit, zoomIn: () => zoomIn(), zoomOut: () => zoomOut() })
</script>

<template>
  <div
    ref="root"
    class="plancia-diagram__flow plancia-pipeline__canvas"
    :class="{ 'plancia-diagram__flow--edit': editable }"
    :style="{ height: `${height}px` }"
  >
    <svg class="plancia-diagram__defs" width="0" height="0" aria-hidden="true">
      <defs>
        <marker :id="marker" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path class="pd-arrow" d="M0 0L10 5L0 10z" />
        </marker>
      </defs>
    </svg>
    <VueFlow
      v-if="laid"
      :id="flowId"
      :nodes="nodes"
      :edges="edges"
      :nodes-draggable="!!editable"
      :nodes-connectable="!!editable"
      :elements-selectable="false"
      :delete-key-code="null"
      :connection-mode="ConnectionMode.Loose"
      :connection-radius="28"
      :zoom-on-double-click="false"
      :zoom-on-scroll="!!editable"
      :min-zoom="0.2"
      :max-zoom="2"
      @node-drag-stop="onDragStop"
      @connect="onConnect"
      @connect-start="onConnectStart"
      @connect-end="onConnectEnd"
      @node-click="onNodeClick"
      @edge-click="onEdgeClick"
      @pane-click="emit('update:selection', null)"
    >
      <template #node-pnode="p">
        <PipelineNode :data="p.data" />
      </template>
      <template #edge-live="p">
        <EditEdge :source-node="p.sourceNode" :target-node="p.targetNode" :data="p.data" />
      </template>
      <template #edge-routed="p">
        <FlowEdge :data="p.data" />
      </template>
    </VueFlow>
  </div>
</template>
