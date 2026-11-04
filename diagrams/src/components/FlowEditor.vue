<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, useId } from 'vue'
import { VueFlow, useVueFlow, ConnectionMode, type Connection, type Edge, type Node } from '@vue-flow/core'
import { pressedOn, reachable, useFlowA11y } from './flowA11y'
import '@vue-flow/core/dist/style.css'
import FlowNode from './FlowNode.vue'
import FlowGroup from './FlowGroup.vue'
import EditEdge from './EditEdge.vue'
import { flowGraph } from '../layout/graph'
import { layoutGraph, type Laid } from '../layout/layout'
import { createMeasure, type Measure } from '../layout/shapes'
import type { Diagram } from '../model/types'
import type { DiagramOp, LayoutPosition } from '../edit/edit'
import type { DiagramEditorLabels } from '../labels'
import type { FlowSelection } from './selection'

// The flow of the editor: Vue Flow with its nodes draggable and joinable.
// It changes nothing itself: what the user does comes out as operations
// (`ops`) for DiagramEditor, which applies them to the YAML, and the
// drawing follows the new YAML. The first drag fixes every node where it
// is, so the others stay put; Delete removes what is selected.
const props = defineProps<{
  diagram: Diagram
  labels: DiagramEditorLabels
  selection: FlowSelection
  height: number
}>()
const emit = defineEmits<{ ops: [ops: DiagramOp[]]; 'update:selection': [s: FlowSelection] }>()

const flowId = `plancia-diagram-editor-${useId()}`
const marker = `${flowId}-arrow`
const root = ref<HTMLElement | null>(null)
const measure = shallowRef<Measure | null>(null)

const laid = computed<Laid | null>(() =>
  measure.value ? layoutGraph(flowGraph(props.diagram), measure.value, props.diagram.layout) : null,
)

const isSelected = (kind: string, id: string) =>
  props.selection !== null && props.selection.kind === kind && 'id' in props.selection && props.selection.id === id

const nodes = computed<Node[]>(() => {
  const l = laid.value
  if (!l) return []
  return [
    ...l.groups.map((g) => ({
      id: g.id,
      type: 'pdgroup',
      position: { x: g.x, y: g.y },
      data: { group: g, selected: isSelected('group', g.id) },
      draggable: false,
      connectable: false,
      zIndex: -1,
      class: isSelected('group', g.id) ? 'pd-selected' : '',
      ...reachable(g.label || g.id, props.labels.groupRole),
    })),
    ...l.nodes.map((n) => ({
      id: n.id,
      type: 'shape',
      position: { x: n.x, y: n.y },
      data: {
        node: n,
        direction: props.diagram.direction,
        tree: false,
        open: () => {},
        openLabel: props.labels.open,
        editable: true,
        selected: isSelected('node', n.id),
      },
      ...reachable(n.label || n.id, props.labels.nodeRole),
    })),
  ]
})

const edges = computed<Edge[]>(() => {
  const name = new Map(laid.value?.nodes.map((n) => [n.id, n.label || n.id]))
  return (laid.value?.edges ?? []).map((e) => {
    const s = props.selection
    const selected = s?.kind === 'edge' && s.edge.from === e.from && s.edge.to === e.to && (s.edge.nth ?? 0) === e.nth
    const said = props.labels.edgeName(name.get(e.from) ?? e.from, name.get(e.to) ?? e.to)
    return {
      id: e.id,
      source: e.from,
      target: e.to,
      type: 'live',
      data: { edge: e, marker, selected },
      ...reachable(e.label ? `${said}, ${e.label}` : said, props.labels.edgeRole),
    }
  })
})

const { fitView, getNodes, screenToFlowCoordinate, onNodesInitialized } = useVueFlow(flowId)
useFlowA11y(flowId, () => props.labels)
let fitted = false
onNodesInitialized(() => {
  if (!fitted) fitView({ padding: 0.1, maxZoom: 1 })
  fitted = true
})

onMounted(() => {
  measure.value = createMeasure(getComputedStyle(root.value!).fontFamily)
})

/** Every node where it is now: the first drag fixes the layout. */
function onDragStop() {
  const positions: Record<string, LayoutPosition> = {}
  for (const n of getNodes.value) {
    if (n.type !== 'shape') continue
    const fixed = props.diagram.layout?.[n.id]
    positions[n.id] = { x: n.position.x, y: n.position.y, ...(fixed && fixed.w > 0 ? { w: fixed.w, h: fixed.h } : {}) }
  }
  emit('ops', [{ op: 'move', positions }])
}

// A line dragged from a node's dot joins it to the node it is dropped on:
// on its dot (Vue Flow's connect) or anywhere on its box (connect-end).
let from: string | null = null
let joined = false
function onConnectStart(e: { nodeId?: string }) {
  from = e.nodeId ?? null
  joined = false
}
function onConnect(c: Connection) {
  if (c.source && c.target) {
    joined = true
    emit('ops', [{ op: 'addEdge', from: c.source, to: c.target }])
  }
}
function onConnectEnd(e?: MouseEvent | TouchEvent) {
  const start = from
  from = null
  if (joined || !start || !e) return
  const pt = 'changedTouches' in e ? e.changedTouches[0] : e
  if (!pt) return
  const el = document.elementFromPoint(pt.clientX, pt.clientY)?.closest<HTMLElement>('.vue-flow__node')
  const to = el?.dataset.id
  if (to && to !== start) emit('ops', [{ op: 'addEdge', from: start, to }])
}

function onNodeClick(e: { node: Node }) {
  emit('update:selection', { kind: e.node.type === 'pdgroup' ? 'group' : 'node', id: e.node.id })
}
function onEdgeClick(e: { edge: Edge }) {
  const le = (e.edge.data as { edge: { from: string; to: string; nth: number } }).edge
  emit('update:selection', { kind: 'edge', edge: { from: le.from, to: le.to, nth: le.nth } })
}
/** Enter or Space on a node or a link selects it, as a click does. */
function onKeydown(e: KeyboardEvent) {
  const on = pressedOn(e)
  const node = on?.kind === 'node' ? nodes.value.find((n) => n.id === on.id) : undefined
  const edge = on?.kind === 'edge' ? edges.value.find((x) => x.id === on.id) : undefined
  if (node) onNodeClick({ node })
  if (edge) onEdgeClick({ edge })
}

/** Where a new node goes: the middle of what is in view. */
function center(): LayoutPosition {
  const r = root.value!.getBoundingClientRect()
  const p = screenToFlowCoordinate({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
  return { x: p.x - 40, y: p.y - 18 }
}

defineExpose({ center, fit: () => fitView({ padding: 0.1, maxZoom: 1 }) })
</script>

<template>
  <div ref="root" class="plancia-diagram__flow plancia-diagram__flow--edit" :style="{ height: `${height}px` }" @keydown="onKeydown">
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
      :nodes-draggable="true"
      :nodes-connectable="true"
      :elements-selectable="false"
      :delete-key-code="null"
      :connection-mode="ConnectionMode.Loose"
      :connection-radius="28"
      :zoom-on-double-click="false"
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
      <template #node-shape="p">
        <FlowNode :data="p.data" />
      </template>
      <template #node-pdgroup="p">
        <FlowGroup :data="p.data" />
      </template>
      <template #edge-live="p">
        <EditEdge :source-node="p.sourceNode" :target-node="p.targetNode" :data="p.data" />
      </template>
    </VueFlow>
  </div>
</template>
