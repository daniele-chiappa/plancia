<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import FlowEditor from './FlowEditor.vue'
import HierarchyEditor from './HierarchyEditor.vue'
import VennEditor from './VennEditor.vue'
import MatrixEditor from './MatrixEditor.vue'
import GanttEditor from './GanttEditor.vue'
import DiagramView from './DiagramView.vue'
import MatrixDiagram from './MatrixDiagram.vue'
import { parseDiagram } from '../model/parse'
import { fromMermaid } from '../mermaid/import'
import { fromCanvas } from '../canvas'
import { diagramToSVG } from '../svg/export'
import type { DiagramBranch, EdgeStyle, NodeClass, NodeShape } from '../model/types'
import { EDGE_STYLES, NODE_CLASSES, NODE_SHAPES } from '../model/types'
import { editDiagram, type BranchPath, type DiagramOp } from '../edit/edit'
import { DEFAULT_EDITOR_LABELS, type DiagramEditorLabels } from '../labels'
import type { FlowSelection } from './selection'

/**
 * DiagramEditor — edits a diagram's YAML (`v-model:source`). The Drawing
 * tab edits a flow on its drawing, a tree, a mind map or a fishbone as
 * indented lines, and a Venn, a matrix or a Gantt as a form, each beside
 * its drawing (a matrix's points are dragged on it); the YAML tab edits the
 * text itself. Import puts a pasted Mermaid or Obsidian canvas in place of
 * the diagram. Every change is an operation on the YAML that keeps
 * what it does not touch (editDiagram); Ctrl+Z and Ctrl+Shift+Z undo and
 * redo them. The problems of the YAML are listed below, line by line.
 * `linkSuggest` gives the links the link fields offer: the page knows its
 * notes, the package does not.
 */
const props = withDefaults(
  defineProps<{
    source: string
    labels?: Partial<DiagramEditorLabels>
    linkSuggest?: (query: string) => Promise<{ label: string; link: string }[]>
    /** The height of the drawing, in px. */
    height?: number
  }>(),
  { labels: () => ({}), linkSuggest: undefined, height: 520 },
)
const emit = defineEmits<{ 'update:source': [source: string] }>()

const uid = useId()
const words = computed<DiagramEditorLabels>(() => ({
  ...DEFAULT_EDITOR_LABELS,
  ...props.labels,
  shapes: { ...DEFAULT_EDITOR_LABELS.shapes, ...props.labels.shapes },
  classes: { ...DEFAULT_EDITOR_LABELS.classes, ...props.labels.classes },
  styles: { ...DEFAULT_EDITOR_LABELS.styles, ...props.labels.styles },
}))

const tab = ref<'drawing' | 'yaml'>('drawing')
const read = computed(() => parseDiagram(props.source))
const d = computed(() => read.value.diagram)
const mode = computed(() => {
  const k = d.value?.kind
  if (!k) return 'broken'
  if (k === 'flow') return 'flow'
  if (k === 'tree' || k === 'mindmap' || k === 'fishbone') return 'outline'
  if (k === 'matrix' && !d.value?.matrix) return 'broken'
  return k
})
const hasSections = computed(() => /^sections\s*:/m.test(props.source))
const today = (() => {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
})()
const error = ref('')

// --- history ---

const past = ref<string[]>([])
const future = ref<string[]>([])
let lastKey = ''
let lastAt = 0
let mine = props.source

/** Sends a new source; edits of the same field close together are one step. */
function commit(next: string, key = '') {
  if (next === props.source) return
  const now = Date.now()
  if (!(key && key === lastKey && now - lastAt < 1500)) {
    past.value.push(props.source)
    if (past.value.length > 200) past.value.shift()
  }
  future.value = []
  lastKey = key
  lastAt = now
  mine = next
  emit('update:source', next)
}

// A source the page sets (another version of the note) starts a new history.
watch(
  () => props.source,
  (s) => {
    if (s !== mine) {
      past.value = []
      future.value = []
      mine = s
    }
  },
)

function undo() {
  const prev = past.value.pop()
  if (prev === undefined) return
  future.value.push(props.source)
  lastKey = ''
  mine = prev
  emit('update:source', prev)
}
function redo() {
  const next = future.value.pop()
  if (next === undefined) return
  past.value.push(props.source)
  lastKey = ''
  mine = next
  emit('update:source', next)
}

/** Applies operations to the YAML; the ids of what they added. */
function apply(ops: DiagramOp[], key?: string): string[] {
  error.value = ''
  try {
    const r = editDiagram(props.source, ops)
    commit(r.source, key)
    return r.ids
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    return []
  }
}

// --- selection ---

const flowSel = ref<FlowSelection>(null)
const branchSel = ref<BranchPath | null>(null)
const itemSel = ref<number | null>(null)
const node = computed(() => (flowSel.value?.kind === 'node' ? d.value?.nodes.find((n) => n.id === (flowSel.value as { id: string }).id) : undefined))
const group = computed(() => (flowSel.value?.kind === 'group' ? d.value?.groups.find((g) => g.id === (flowSel.value as { id: string }).id) : undefined))
const edge = computed(() => {
  const s = flowSel.value
  if (s?.kind !== 'edge') return undefined
  return d.value?.edges.filter((e) => e.from === s.edge.from && e.to === s.edge.to)[s.edge.nth ?? 0]
})
const branch = computed<DiagramBranch | undefined>(() => {
  const p = branchSel.value
  if (!p || !d.value?.root) return undefined
  let b: DiagramBranch | undefined = d.value.root
  for (const i of p) b = b?.children[i]
  return b
})
const nodeGroup = computed(() => (node.value ? d.value?.groups.find((g) => g.nodes.includes(node.value!.id))?.id ?? '' : ''))

// --- actions ---

const flow = ref<{ center: () => { x: number; y: number }; fit: () => void } | null>(null)
const frozen = computed(() => !!d.value?.layout && d.value.nodes.some((n) => d.value!.layout![n.id]))

function addNode() {
  const at = frozen.value ? flow.value?.center() : undefined
  const [id] = apply([{ op: 'addNode', label: words.value.newNode, at }])
  if (id) flowSel.value = { kind: 'node', id }
}
function addGroup() {
  const [id] = apply([{ op: 'addGroup', label: words.value.newGroup, nodes: node.value ? [node.value.id] : [] }])
  if (id) flowSel.value = { kind: 'group', id }
}
const canRemove = computed(() => {
  if (mode.value === 'flow') return !!(node.value || edge.value || group.value)
  if (mode.value === 'outline') return !!branchSel.value?.length
  if (mode.value === 'matrix') return itemSel.value !== null && !!d.value?.matrix?.items[itemSel.value]
  return false
})
const rootEl = ref<HTMLElement | null>(null)
function remove() {
  const s = flowSel.value
  // What had the focus may go with it: the editor keeps it, for Ctrl+Z.
  rootEl.value?.focus({ preventScroll: true })
  if (mode.value === 'flow' && s) {
    if (s.kind === 'node') apply([{ op: 'removeNode', id: s.id }])
    else if (s.kind === 'group') apply([{ op: 'removeGroup', id: s.id }])
    else apply([{ op: 'removeEdge', edge: s.edge }])
    flowSel.value = null
  } else if (mode.value === 'outline' && branchSel.value?.length) {
    apply([{ op: 'removeBranch', path: branchSel.value }])
    branchSel.value = null
  } else if (mode.value === 'matrix' && itemSel.value !== null) {
    apply([{ op: 'removeItem', index: itemSel.value }])
    itemSel.value = null
  }
}

function branchMove(kind: 'child' | 'sibling' | 'indent' | 'outdent' | 'up' | 'down') {
  const p = branchSel.value
  if (!p || !d.value?.root) return
  const parent = p.slice(0, -1)
  const i = p[p.length - 1] ?? 0
  const count = (q: BranchPath) => {
    let b = d.value!.root!
    for (const k of q) b = b.children[k]!
    return b.children.length
  }
  let op: DiagramOp | null = null
  let then: BranchPath | null = null
  if (kind === 'child') {
    op = { op: 'addBranch', parent: p, index: count(p), label: words.value.newBranch }
    then = [...p, count(p)]
  } else if (kind === 'sibling' && p.length > 0) {
    op = { op: 'addBranch', parent, index: i + 1, label: words.value.newBranch }
    then = [...parent, i + 1]
  } else if (kind === 'indent' && p.length > 0 && i > 0) {
    const prev = [...parent, i - 1]
    op = { op: 'moveBranch', path: p, parent: prev, index: count(prev) }
    then = [...prev, count(prev)]
  } else if (kind === 'outdent' && p.length >= 2) {
    const gp = parent.slice(0, -1)
    const pi = parent[parent.length - 1]!
    op = { op: 'moveBranch', path: p, parent: gp, index: pi + 1 }
    then = [...gp, pi + 1]
  } else if (kind === 'up' && p.length > 0 && i > 0) {
    op = { op: 'moveBranch', path: p, parent, index: i - 1 }
    then = [...parent, i - 1]
  } else if (kind === 'down' && p.length > 0 && i < count(parent) - 1) {
    op = { op: 'moveBranch', path: p, parent, index: i + 2 }
    then = [...parent, i + 1]
  }
  if (op) {
    apply([op])
    branchSel.value = then
  }
}

function onKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null
  const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
  const mod = e.ctrlKey || e.metaKey
  if (mod && !typing && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    if (e.shiftKey) redo()
    else undo()
  } else if (mod && !typing && e.key.toLowerCase() === 'y') {
    e.preventDefault()
    redo()
  } else if (!typing && (e.key === 'Delete' || e.key === 'Backspace') && tab.value === 'drawing' && canRemove.value) {
    e.preventDefault()
    remove()
  }
}

// --- link suggestions ---

const suggestions = ref<{ label: string; link: string }[]>([])
let timer: ReturnType<typeof setTimeout> | undefined
function suggest(q: string) {
  if (!props.linkSuggest || q.length < 2) return
  clearTimeout(timer)
  timer = setTimeout(async () => {
    suggestions.value = await props.linkSuggest!(q.replace(/^\[\[|\]\]$/g, '')).catch(() => [])
  }, 200)
}
const linksId = `${uid}-links`

// --- YAML tab ---

const yamlEl = ref<HTMLTextAreaElement | null>(null)
function goToLine(line: number) {
  if (!line) return
  tab.value = 'yaml'
  setTimeout(() => {
    const el = yamlEl.value
    if (!el) return
    const lines = props.source.split('\n')
    const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0)
    el.focus()
    el.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0))
  })
}

const value = (e: Event) => (e.target as HTMLInputElement).value

// --- import ---

const importing = ref(false)
const importText = ref('')
const importNotes = ref<string[]>([])
const converting = ref(false)
// What an import left out is said until the diagram changes again.
let imported = ''
watch(
  () => props.source,
  (s) => {
    if (s !== imported) importNotes.value = []
  },
)

/** The pasted text in place of the diagram: an Obsidian canvas's JSON, or Mermaid. */
async function runImport() {
  const text = importText.value.trim()
  if (!text) return
  error.value = ''
  converting.value = true
  try {
    const r = text.startsWith('{') ? fromCanvas(text) : await fromMermaid(text)
    imported = r.source
    commit(r.source)
    importNotes.value = r.warnings
    importing.value = false
    importText.value = ''
    tab.value = 'drawing'
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    converting.value = false
  }
}

defineExpose({
  undo,
  redo,
  /** The diagram's drawing as an SVG file, as the view exports it; null when it does not read. */
  exportSVG: (): Promise<string | null> => (d.value ? diagramToSVG(d.value, rootEl.value) : Promise.resolve(null)),
})
</script>

<template>
  <div ref="rootEl" class="plancia-diagram plancia-diagram-editor" tabindex="-1" @keydown="onKey">
    <div class="pd-editor__bar">
      <div class="pd-editor__tabs" role="tablist">
        <button type="button" role="tab" :aria-selected="tab === 'drawing'" data-tab="drawing" @click="tab = 'drawing'">
          {{ words.drawing }}
        </button>
        <button type="button" role="tab" :aria-selected="tab === 'yaml'" data-tab="yaml" @click="tab = 'yaml'">
          {{ words.yaml }}
        </button>
      </div>
      <div class="pd-editor__actions">
        <template v-if="tab === 'drawing' && mode === 'flow'">
          <button type="button" data-action="add-node" @click="addNode">{{ words.addNode }}</button>
          <button type="button" data-action="add-group" @click="addGroup">{{ words.addGroup }}</button>
          <button type="button" data-action="relayout" :disabled="!d?.layout" @click="apply([{ op: 'relayout' }])">
            {{ words.relayout }}
          </button>
          <button type="button" :title="words.fit" :aria-label="words.fit" @click="flow?.fit()">⤢</button>
        </template>
        <button v-if="tab === 'drawing'" type="button" data-action="remove" :disabled="!canRemove" @click="remove">
          {{ words.remove }}
        </button>
        <button type="button" data-action="import" :aria-expanded="importing" @click="importing = !importing">{{ words.import }}</button>
        <button type="button" data-action="undo" :disabled="!past.length" :title="`${words.undo} (Ctrl+Z)`" @click="undo">
          ↶ {{ words.undo }}
        </button>
        <button type="button" data-action="redo" :disabled="!future.length" :title="`${words.redo} (Ctrl+Shift+Z)`" @click="redo">
          ↷ {{ words.redo }}
        </button>
      </div>
    </div>
    <p v-if="error" class="plancia-diagram__status" role="alert">{{ error }}</p>
    <div v-if="importing" class="pd-editor__import">
      <p class="pd-editor__hint">{{ words.importHint }}</p>
      <textarea v-model="importText" data-field="import" rows="8" spellcheck="false" :aria-label="words.import" />
      <div class="pd-form__row">
        <button type="button" data-action="import-apply" :disabled="!importText.trim() || converting" @click="runImport">{{ words.importApply }}</button>
        <button type="button" @click="importing = false">{{ words.importCancel }}</button>
      </div>
    </div>
    <div v-if="importNotes.length" class="pd-editor__notes" role="status">
      {{ words.importWarnings }}
      <ul>
        <li v-for="(n, i) in importNotes" :key="i">{{ n }}</li>
      </ul>
    </div>

    <div v-if="tab === 'drawing'" class="pd-editor__main" :data-mode="mode" :data-grid="d?.matrix?.rows.length ? '' : undefined">
      <template v-if="mode === 'flow' && d">
        <FlowEditor
          ref="flow"
          v-model:selection="flowSel"
          class="pd-editor__canvas"
          :diagram="d"
          :labels="words"
          :height="height"
          @ops="(ops) => apply(ops)"
        />
        <aside class="pd-editor__panel" :aria-label="words.node">
          <template v-if="node">
            <h3>{{ words.node }} <code>{{ node.id }}</code></h3>
            <label>{{ words.label }}
              <input data-field="label" :value="node.label" @input="apply([{ op: 'updateNode', id: node.id, label: value($event) }], `node:${node.id}:label`)" />
            </label>
            <label>{{ words.shape }}
              <select data-field="shape" :value="node.shape" @change="apply([{ op: 'updateNode', id: node.id, shape: value($event) as NodeShape }])">
                <option v-for="s in NODE_SHAPES" :key="s" :value="s">{{ words.shapes[s] }}</option>
              </select>
            </label>
            <label>{{ words.class }}
              <select data-field="class" :value="node.class" @change="apply([{ op: 'updateNode', id: node.id, class: value($event) as NodeClass | '' }])">
                <option value="">{{ words.none }}</option>
                <option v-for="c in NODE_CLASSES" :key="c" :value="c">{{ words.classes[c] }}</option>
              </select>
            </label>
            <label>{{ words.link }}
              <input
                data-field="link"
                :value="node.link"
                :placeholder="words.linkHint"
                :list="linksId"
                @input="suggest(value($event)); apply([{ op: 'updateNode', id: node.id, link: value($event) }], `node:${node.id}:link`)"
              />
            </label>
            <label v-if="d.groups.length">{{ words.group }}
              <select data-field="group" :value="nodeGroup" @change="apply([{ op: 'setGroup', node: node.id, group: value($event) || null }])">
                <option value="">{{ words.none }}</option>
                <option v-for="g in d.groups" :key="g.id" :value="g.id">{{ g.label || g.id }}</option>
              </select>
            </label>
          </template>
          <template v-else-if="edge">
            <h3>{{ words.edge }} <code>{{ edge.from }} → {{ edge.to }}</code></h3>
            <label>{{ words.label }}
              <input
                data-field="label"
                :value="edge.label"
                @input="apply([{ op: 'updateEdge', edge: (flowSel as { edge: { from: string; to: string; nth?: number } }).edge, label: value($event) }], `edge:${edge.from}:${edge.to}:label`)"
              />
            </label>
            <label>{{ words.style }}
              <select
                data-field="style"
                :value="edge.style"
                @change="apply([{ op: 'updateEdge', edge: (flowSel as { edge: { from: string; to: string; nth?: number } }).edge, style: value($event) as EdgeStyle }])"
              >
                <option v-for="s in EDGE_STYLES" :key="s" :value="s">{{ words.styles[s] }}</option>
              </select>
            </label>
          </template>
          <template v-else-if="group">
            <h3>{{ words.group }} <code>{{ group.id }}</code></h3>
            <label>{{ words.label }}
              <input data-field="label" :value="group.label" @input="apply([{ op: 'updateGroup', id: group.id, label: value($event) }], `group:${group.id}:label`)" />
            </label>
          </template>
          <p v-else class="pd-editor__hint">{{ words.connectHint }}</p>
        </aside>
      </template>

      <template v-else-if="mode === 'outline' && d">
        <div class="pd-editor__outline">
          <HierarchyEditor v-model:selection="branchSel" :diagram="d" :labels="words" @ops="(ops, key) => apply(ops, key)" />
          <div class="pd-editor__branch-tools">
            <button type="button" :disabled="!branchSel" @click="branchMove('child')">{{ words.addChild }}</button>
            <button type="button" :disabled="!branchSel?.length" @click="branchMove('sibling')">{{ words.addSibling }}</button>
            <button type="button" :disabled="!branchSel?.length" :title="`${words.indent} (Tab)`" @click="branchMove('indent')">→</button>
            <button type="button" :disabled="!branchSel?.length" :title="`${words.outdent} (Shift+Tab)`" @click="branchMove('outdent')">←</button>
            <button type="button" :disabled="!branchSel?.length" :title="`${words.moveUp} (Alt+↑)`" @click="branchMove('up')">↑</button>
            <button type="button" :disabled="!branchSel?.length" :title="`${words.moveDown} (Alt+↓)`" @click="branchMove('down')">↓</button>
          </div>
          <label v-if="branch && branchSel" class="pd-editor__branch-link">{{ words.link }}
            <input
              data-field="link"
              :value="branch.link"
              :placeholder="words.linkHint"
              :list="linksId"
              @input="suggest(value($event)); apply([{ op: 'setBranchLink', path: branchSel, link: value($event) }], `branch:${branchSel.join('.')}:link`)"
            />
          </label>
          <p class="pd-editor__hint">{{ words.outlineHint }}</p>
        </div>
        <div class="pd-editor__preview">
          <DiagramView :diagram="d" :labels="words" :max-height="height" />
        </div>
      </template>

      <template v-else-if="(mode === 'venn' || mode === 'matrix' || mode === 'gantt') && d">
        <div class="pd-editor__form">
          <VennEditor v-if="mode === 'venn'" :diagram="d" :labels="words" :links-id="linksId" :suggest="suggest" @ops="(ops, key) => apply(ops, key)" />
          <MatrixEditor
            v-else-if="mode === 'matrix'"
            v-model:selected="itemSel"
            :diagram="d"
            :labels="words"
            :links-id="linksId"
            :suggest="suggest"
            @ops="(ops, key) => apply(ops, key)"
          />
          <GanttEditor
            v-else
            :diagram="d"
            :labels="words"
            :links-id="linksId"
            :suggest="suggest"
            :sections="hasSections"
            :today="today"
            @ops="(ops, key) => apply(ops, key)"
          />
        </div>
        <div class="pd-editor__preview">
          <figure v-if="mode === 'matrix' && !d.matrix?.rows.length" class="plancia-diagram">
            <MatrixDiagram
              :diagram="d"
              :labels="words"
              editable
              :selected="itemSel"
              @select="(i) => (itemSel = i)"
              @move="(i, x, y) => apply([{ op: 'updateItem', index: i, x, y }])"
            />
          </figure>
          <DiagramView v-else :diagram="d" :labels="words" :max-height="height" />
        </div>
      </template>

      <p v-else class="pd-editor__hint" role="note">{{ words.broken }}</p>
    </div>

    <div v-else class="pd-editor__yaml">
      <textarea
        ref="yamlEl"
        class="pd-editor__textarea"
        :value="source"
        spellcheck="false"
        :aria-label="words.yaml"
        :style="{ height: `${height}px` }"
        @input="commit(value($event), 'yaml')"
      />
    </div>

    <div class="pd-editor__problems" aria-live="polite">
      <template v-if="read.problems.length">
        {{ words.problems }}
        <ul>
          <li v-for="(p, i) in read.problems" :key="i">
            <button v-if="p.line" type="button" @click="goToLine(p.line)">{{ words.line }} {{ p.line }}</button>: {{ p.message }}
          </li>
        </ul>
      </template>
      <span v-else>{{ words.noProblems }}</span>
    </div>
    <datalist :id="linksId">
      <option v-for="s in suggestions" :key="s.link" :value="s.link">{{ s.label }}</option>
    </datalist>
  </div>
</template>
