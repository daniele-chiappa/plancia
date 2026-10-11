<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { Diagram, DiagramBranch } from '../model/types'
import type { BranchPath, DiagramOp } from '../edit/edit'
import type { DiagramEditorLabels } from '../labels'

// The branches of a tree, a mind map or a fishbone as indented lines, one
// input each. Enter adds a branch after, Tab and Shift+Tab change its level,
// Alt+↑ and Alt+↓ move it, ↑ and ↓ go to the line before or after, and
// Backspace on an empty line takes it away; a line dragged by its grip
// goes after the line it is dropped on. Like FlowEditor it changes nothing
// itself: it says operations, and follows the YAML they make.
const props = defineProps<{ diagram: Diagram; labels: DiagramEditorLabels; selection: BranchPath | null }>()
const emit = defineEmits<{ ops: [ops: DiagramOp[], key?: string]; 'update:selection': [p: BranchPath | null] }>()

interface Row {
  path: BranchPath
  key: string
  depth: number
  label: string
  link: string
  children: number
}

const rows = computed<Row[]>(() => {
  const out: Row[] = []
  const walk = (b: DiagramBranch, path: BranchPath) => {
    out.push({ path, key: path.join('.'), depth: path.length, label: b.label, link: b.link, children: b.children.length })
    b.children.forEach((c, i) => walk(c, [...path, i]))
  }
  if (props.diagram.root) walk(props.diagram.root, [])
  return out
})

const box = ref<HTMLElement | null>(null)
let pending: { path: BranchPath; select: boolean } | null = null

/** Focuses a line, now or once the YAML has changed; a new one with its text selected, to type over. */
function focus(p: BranchPath | null, later = true, select = false) {
  if (!p) return
  if (later) {
    pending = { path: p, select }
    return
  }
  const el = box.value?.querySelector<HTMLInputElement>(`input[data-path="${p.join('.')}"]`)
  el?.focus()
  if (select) el?.select()
  emit('update:selection', p)
}
watch(
  () => props.diagram,
  () =>
    nextTick(() => {
      const p = pending
      pending = null
      if (p) focus(p.path, false, p.select)
    }),
  { flush: 'post' },
)

const siblings = (p: BranchPath) => {
  if (p.length === 0) return 1
  let b = props.diagram.root!
  for (const i of p.slice(0, -1)) b = b.children[i]!
  return b.children.length
}
const childCount = (p: BranchPath) => {
  let b = props.diagram.root!
  for (const i of p) b = b.children[i]!
  return b.children.length
}

function rename(r: Row, value: string) {
  emit('ops', [{ op: 'renameBranch', path: r.path, label: value }], `branch:${r.key}:label`)
}

function move(p: BranchPath, parent: BranchPath, index: number, then: BranchPath) {
  emit('ops', [{ op: 'moveBranch', path: p, parent, index }])
  focus(then)
}

function onKey(e: KeyboardEvent, r: Row, at: number) {
  const p = r.path
  const parent = p.slice(0, -1)
  const i = p[p.length - 1] ?? 0
  if (e.key === 'Enter') {
    e.preventDefault()
    const where = p.length === 0 ? { parent: [] as BranchPath, index: 0 } : { parent, index: i + 1 }
    emit('ops', [{ op: 'addBranch', parent: where.parent, index: where.index, label: props.labels.newBranch }])
    focus([...where.parent, where.index], true, true)
  } else if (e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault()
    if (p.length > 0 && i > 0) {
      const prev = [...parent, i - 1]
      const n = childCount(prev)
      move(p, prev, n, [...prev, n])
    }
  } else if (e.key === 'Tab' && e.shiftKey) {
    e.preventDefault()
    if (p.length >= 2) {
      const gp = parent.slice(0, -1)
      const pi = parent[parent.length - 1]!
      move(p, gp, pi + 1, [...gp, pi + 1])
    }
  } else if (e.altKey && e.key === 'ArrowUp') {
    e.preventDefault()
    if (p.length > 0 && i > 0) move(p, parent, i - 1, [...parent, i - 1])
  } else if (e.altKey && e.key === 'ArrowDown') {
    e.preventDefault()
    if (p.length > 0 && i < siblings(p) - 1) move(p, parent, i + 2, [...parent, i + 1])
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    focus(rows.value[at - 1]?.path ?? null, false)
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    focus(rows.value[at + 1]?.path ?? null, false)
  } else if (e.key === 'Backspace' && r.label === '' && p.length > 0) {
    e.preventDefault()
    emit('ops', [{ op: 'removeBranch', path: p }])
    focus(rows.value[at - 1]?.path ?? [])
  }
}

let dragged: BranchPath | null = null
function onDragStart(r: Row, e: DragEvent) {
  dragged = r.path
  e.dataTransfer?.setData('text/plain', r.label)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
function onDrop(r: Row) {
  const from = dragged
  dragged = null
  if (!from || from.length === 0 || from.join('.') === r.key) return
  if (r.path.length === 0) emit('ops', [{ op: 'moveBranch', path: from, parent: [], index: 0 }])
  else {
    const parent = r.path.slice(0, -1)
    emit('ops', [{ op: 'moveBranch', path: from, parent, index: r.path[r.path.length - 1]! + 1 }])
  }
}

const selectedKey = computed(() => props.selection?.join('.') ?? null)
</script>

<template>
  <div ref="box" class="pd-outline" role="tree" :aria-label="labels.outlineHint">
    <div
      v-for="(r, at) in rows"
      :key="r.key"
      class="pd-outline__row"
      role="treeitem"
      :aria-level="r.depth + 1"
      :aria-selected="selectedKey === r.key"
      :data-selected="selectedKey === r.key ? '' : undefined"
      :style="{ paddingLeft: `${r.depth * 1.25}rem` }"
      @dragover.prevent
      @drop.prevent="onDrop(r)"
    >
      <span
        v-if="r.depth > 0"
        class="pd-outline__grip"
        draggable="true"
        aria-hidden="true"
        @dragstart="onDragStart(r, $event)"
      >⋮⋮</span>
      <span v-else class="pd-outline__grip" aria-hidden="true">●</span>
      <input
        class="pd-outline__input"
        :data-path="r.key"
        :value="r.label"
        :aria-label="r.depth === 0 ? labels.label : `${labels.label} ${r.depth}`"
        @input="rename(r, ($event.target as HTMLInputElement).value)"
        @keydown="onKey($event, r, at)"
        @focus="emit('update:selection', r.path)"
      />
      <span v-if="r.link" class="pd-outline__link" :title="r.link" aria-hidden="true">↗</span>
    </div>
  </div>
</template>
