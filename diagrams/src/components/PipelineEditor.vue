<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import PipelineCanvas, { type PipelineSelection } from './PipelineCanvas.vue'
import SchemaForm from './SchemaForm.vue'
import ExprInput from './ExprInput.vue'
import { readPipeline } from '../pipeline/read'
import { editPipeline, type PipelineOp } from '../pipeline/edit'
import { exprSuggestions } from '../pipeline/expr'
import { TRIGGER_ID, TRIGGER_KINDS, type NodeTypeInfo, type RunState, type StepState } from '../pipeline/types'
import { DEFAULT_PIPELINE_LABELS, type PipelineLabels } from '../labels'

/**
 * PipelineEditor — edits the YAML of a ```pipeline block of gosidian
 * (`v-model:source`, ADR-035). The Drawing tab shows the trigger and the
 * nodes: a node is added from the node types (`catalog`, from the page),
 * dragged, joined to the nodes it waits for, and set in a panel whose form
 * comes from the JSON Schema of its type, the {{ }} references offered in
 * its texts. The YAML tab edits the text. Every change is an operation on
 * the YAML that keeps what it does not touch (editPipeline); Ctrl+Z and
 * Ctrl+Shift+Z undo and redo. `run` shows how each node went in a run;
 * `problems` are the server's, about the text as it is now.
 */
const props = withDefaults(
  defineProps<{
    source: string
    catalog?: NodeTypeInfo[]
    run?: RunState | null
    problems?: string[]
    labels?: Partial<PipelineLabels>
    height?: number
    /** The triggers the menu offers, as the server knows them; default TRIGGER_KINDS. */
    triggerKinds?: readonly string[]
  }>(),
  { catalog: () => [], run: null, problems: () => [], labels: () => ({}), height: 520, triggerKinds: () => TRIGGER_KINDS },
)
const emit = defineEmits<{ 'update:source': [source: string] }>()

const words = computed<PipelineLabels>(() => ({
  ...DEFAULT_PIPELINE_LABELS,
  ...props.labels,
  triggers: { ...DEFAULT_PIPELINE_LABELS.triggers, ...props.labels.triggers },
  statuses: { ...DEFAULT_PIPELINE_LABELS.statuses, ...props.labels.statuses },
}))

// The menu's triggers: the consumer's, and the pipeline's own when it is
// none of them, so that a trigger the menu does not know is not lost.
const triggerMenu = computed(() => {
  const on = p.value?.trigger.on ?? ''
  const kinds = [...props.triggerKinds]
  return on && !kinds.includes(on) ? [...kinds, on] : kinds
})
const triggerWord = (k: string) => (words.value.triggers as Record<string, string>)[k] ?? k
const list = (s: string) => s.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean)

const tab = ref<'drawing' | 'yaml'>('drawing')
const read = computed(() => readPipeline(props.source))
const p = computed(() => read.value.pipeline)
const error = ref('')

// --- history, as in DiagramEditor ---

const past = ref<string[]>([])
const future = ref<string[]>([])
let lastKey = ''
let lastAt = 0
let mine = props.source

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

function apply(ops: PipelineOp[], key?: string): string[] {
  error.value = ''
  try {
    const r = editPipeline(props.source, ops)
    commit(r.source, key)
    return r.ids
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    return []
  }
}

// --- selection ---

const selection = ref<PipelineSelection>(null)
const node = computed(() => {
  const s = selection.value
  return s?.kind === 'node' && s.id !== TRIGGER_ID ? p.value?.nodes.find((n) => n.id === s.id) : undefined
})
const triggerSelected = computed(() => selection.value?.kind === 'node' && selection.value.id === TRIGGER_ID)
const edge = computed(() => (selection.value?.kind === 'edge' ? selection.value : null))
const types = computed(() => new Map(props.catalog.map((t) => [t.type, t])))
const nodeType = computed(() => (node.value ? types.value.get(node.value.use) : undefined))
const suggestions = computed(() => (p.value && node.value ? exprSuggestions(p.value, node.value.id, props.catalog) : []))
const step = computed<StepState | undefined>(() => (node.value ? props.run?.steps[node.value.id] : undefined))

const groups = computed(() => {
  const out = new Map<string, NodeTypeInfo[]>()
  for (const t of props.catalog) out.set(t.group, [...(out.get(t.group) ?? []), t])
  return [...out.entries()]
})

// --- actions ---

const canvas = ref<{ center: () => { x: number; y: number }; fit: () => void } | null>(null)
const frozen = computed(() => !!p.value?.layout && Object.keys(p.value.layout).length > 0)
const paletteOpen = ref(false)

function addNode(use: string) {
  paletteOpen.value = false
  const at = frozen.value ? canvas.value?.center() : undefined
  const [id] = apply([{ op: 'addNode', use, at }])
  if (id) selection.value = { kind: 'node', id }
  // A node laid out by dagre goes at the bottom: bring it into view.
  if (!at) setTimeout(() => canvas.value?.fit(), 60)
}

const canRemove = computed(() => !!node.value || !!(edge.value && edge.value.from !== TRIGGER_ID))
const rootEl = ref<HTMLElement | null>(null)
function remove() {
  rootEl.value?.focus({ preventScroll: true })
  if (node.value) {
    apply([{ op: 'removeNode', id: node.value.id }])
    selection.value = null
  } else if (edge.value && edge.value.from !== TRIGGER_ID) {
    apply([{ op: 'disconnect', from: edge.value.from, to: edge.value.to }])
    selection.value = null
  }
}

function rename(to: string) {
  const n = node.value
  if (!n || to.trim() === n.id || !to.trim()) return
  apply([{ op: 'renameNode', id: n.id, to: to.trim() }])
  if (!error.value) selection.value = { kind: 'node', id: to.trim() }
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

const value = (e: Event) => (e.target as HTMLInputElement).value
const num = (s: string) => (s.trim() === '' || !Number.isFinite(Number(s)) ? undefined : Math.trunc(Number(s)))

function duration(s: StepState): string {
  if (!s.started) return ''
  const end = s.finished ? Date.parse(s.finished) : Date.now()
  const ms = Math.max(0, end - Date.parse(s.started))
  return ms < 1000 ? `${ms} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 60000)} min`
}
const outputText = (s: StepState) => (s.output === undefined || s.output === null ? '' : typeof s.output === 'string' ? s.output : JSON.stringify(s.output, null, 2))

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

defineExpose({ undo, redo })
</script>

<template>
  <div ref="rootEl" class="plancia-diagram plancia-diagram-editor plancia-pipeline-editor" tabindex="-1" @keydown="onKey">
    <div class="pd-editor__bar">
      <div class="pd-editor__tabs" role="tablist">
        <button type="button" role="tab" :aria-selected="tab === 'drawing'" data-tab="drawing" @click="tab = 'drawing'">{{ words.drawing }}</button>
        <button type="button" role="tab" :aria-selected="tab === 'yaml'" data-tab="yaml" @click="tab = 'yaml'">{{ words.yaml }}</button>
      </div>
      <div class="pd-editor__actions">
        <template v-if="tab === 'drawing' && p">
          <span class="pd-palette">
            <button type="button" data-action="add-node" :aria-expanded="paletteOpen" @click="paletteOpen = !paletteOpen">{{ words.addNode }} ▾</button>
            <span v-if="paletteOpen" class="pd-palette__menu" role="menu" :aria-label="words.palette">
              <template v-for="[g, list] in groups" :key="g">
                <span class="pd-palette__group">{{ g === 'base' ? words.base : g }}</span>
                <button
                  v-for="t in list"
                  :key="t.type"
                  type="button"
                  role="menuitem"
                  :data-type="t.type"
                  :title="t.description"
                  @click="addNode(t.type)"
                >
                  <code>{{ t.type }}</code><span>{{ t.description }}</span>
                </button>
              </template>
            </span>
          </span>
          <button type="button" data-action="relayout" :disabled="!frozen" @click="apply([{ op: 'relayout' }])">{{ words.relayout }}</button>
          <button type="button" :title="words.fit" :aria-label="words.fit" @click="canvas?.fit()">⤢</button>
          <button type="button" data-action="remove" :disabled="!canRemove" @click="remove">{{ words.remove }}</button>
        </template>
        <button type="button" data-action="undo" :disabled="!past.length" :title="`${words.undo} (Ctrl+Z)`" @click="undo">↶ {{ words.undo }}</button>
        <button type="button" data-action="redo" :disabled="!future.length" :title="`${words.redo} (Ctrl+Shift+Z)`" @click="redo">↷ {{ words.redo }}</button>
      </div>
    </div>
    <p v-if="error" class="plancia-diagram__status" role="alert">{{ error }}</p>

    <div v-if="tab === 'drawing'" class="pd-editor__main" data-mode="flow">
      <template v-if="p">
        <PipelineCanvas
          ref="canvas"
          v-model:selection="selection"
          class="pd-editor__canvas"
          :pipeline="p"
          :catalog="catalog"
          :run="run"
          :labels="words"
          editable
          :height="height"
          @ops="(ops) => apply(ops)"
        />
        <aside class="pd-editor__panel pd-pipeline__panel" :aria-label="words.node">
          <template v-if="node">
            <h3>{{ words.node }} <code>{{ node.id }}</code></h3>
            <label>{{ words.id }}
              <input data-field="id" :value="node.id" @change="rename(value($event))" @keydown.enter="rename(value($event))" />
            </label>
            <label>{{ words.type }}
              <select data-field="use" :value="node.use" @change="apply([{ op: 'setUse', id: node.id, use: value($event) }])">
                <option v-if="!types.has(node.use)" :value="node.use">{{ node.use }}</option>
                <optgroup v-for="[g, list] in groups" :key="g" :label="g === 'base' ? words.base : g">
                  <option v-for="t in list" :key="t.type" :value="t.type">{{ t.type }}</option>
                </optgroup>
              </select>
            </label>
            <p v-if="nodeType?.description" class="pd-editor__hint">{{ nodeType.description }}</p>
            <p v-else-if="catalog.length && !nodeType" class="pd-editor__hint pd-pipeline__warn">{{ words.unknownType }}</p>

            <section v-if="step" class="pd-pipeline__run" data-run-step>
              <h4>{{ words.run }}</h4>
              <dl>
                <dt>{{ words.status }}</dt>
                <dd :data-status="step.status">{{ words.statuses[step.status] }}</dd>
                <template v-if="(step.attempt ?? 1) > 1"><dt>{{ words.attempt }}</dt><dd>{{ step.attempt }}</dd></template>
                <template v-if="duration(step)"><dt>{{ words.duration }}</dt><dd>{{ duration(step) }}</dd></template>
                <template v-if="step.waitUntil"><dt>{{ words.waitingUntil }}</dt><dd>{{ step.waitUntil }}</dd></template>
              </dl>
              <p v-if="step.error" class="pd-pipeline__error">{{ step.error }}</p>
              <template v-if="outputText(step)">
                <h5>{{ words.output }}<small v-if="step.outputTruncated"> — {{ words.outputTruncated }}</small></h5>
                <pre class="pd-pipeline__output">{{ outputText(step) }}</pre>
              </template>
            </section>

            <h4>{{ words.settings }}</h4>
            <SchemaForm
              :schema="nodeType?.input_schema"
              :value="node.with"
              :suggestions="suggestions"
              :labels="words"
              @set="(k, v) => apply([{ op: 'setWith', id: node!.id, key: k, value: v }], `with:${node!.id}:${k}`)"
            />
            <p class="pd-editor__hint">{{ words.exprHint }}</p>

            <details class="pd-pipeline__more">
              <summary>{{ words.more }}</summary>
              <p class="pd-pipeline__after">
                {{ words.waitsFor }}:
                <template v-if="node.after.length">
                  <span v-for="a in node.after" :key="a" class="pd-chip">{{ a }}
                    <button type="button" :aria-label="`${words.remove} ${a}`" @click="apply([{ op: 'disconnect', from: a, to: node!.id }])">✕</button>
                  </span>
                </template>
                <em v-else>{{ words.startsAtOnce }}</em>
              </p>
              <label>{{ words.when }}
                <ExprInput field="when" :value="node.when" :suggestions="suggestions" :label="words.when" placeholder="{{ … }}"
                  @input="(v) => apply([{ op: 'setNodeField', id: node!.id, field: 'when', value: v }], `when:${node!.id}`)" />
              </label>
              <label>{{ words.unless }}
                <ExprInput field="unless" :value="node.unless" :suggestions="suggestions" :label="words.unless" placeholder="{{ … }}"
                  @input="(v) => apply([{ op: 'setNodeField', id: node!.id, field: 'unless', value: v }], `unless:${node!.id}`)" />
              </label>
              <label>{{ words.each }}
                <ExprInput field="each" :value="node.each" :suggestions="suggestions" :label="words.each" placeholder="{{ … }}"
                  @input="(v) => apply([{ op: 'setNodeField', id: node!.id, field: 'each', value: v }], `each:${node!.id}`)" />
              </label>
              <span class="pd-form__row">
                <label>{{ words.attempts }}
                  <input class="pd-form__number" type="number" min="1" max="10" data-field="retry-attempts" :value="node.retry?.attempts ?? ''"
                    @change="apply([{ op: 'setRetry', id: node!.id, attempts: num(value($event)), backoff: node!.retry?.backoff }])" />
                </label>
                <label>{{ words.backoff }}
                  <input class="pd-form__number" data-field="retry-backoff" placeholder="10s" :value="node.retry?.backoff ?? ''"
                    @change="apply([{ op: 'setRetry', id: node!.id, attempts: node!.retry?.attempts, backoff: value($event).trim() || undefined }])" />
                </label>
              </span>
              <span class="pd-form__row">
                <label>{{ words.timeout }}
                  <input class="pd-form__number" data-field="timeout" placeholder="5m" :value="node.timeout"
                    @change="apply([{ op: 'setNodeField', id: node!.id, field: 'timeout', value: value($event) }])" />
                </label>
                <label>{{ words.onError }}
                  <select data-field="on_error" :value="node.onError || 'stop'" @change="apply([{ op: 'setNodeField', id: node!.id, field: 'on_error', value: value($event) === 'stop' ? '' : value($event) }])">
                    <option value="stop">{{ words.onErrorStop }}</option>
                    <option value="continue">{{ words.onErrorContinue }}</option>
                  </select>
                </label>
              </span>
            </details>
          </template>

          <template v-else-if="triggerSelected">
            <h3>{{ words.trigger }}</h3>
            <label>{{ words.triggerOn }}
              <select data-field="trigger-on" :value="p.trigger.on" @change="apply([{ op: 'setTrigger', on: value($event) }])">
                <option v-for="k in triggerMenu" :key="k" :value="k">{{ triggerWord(k) }}</option>
              </select>
            </label>
            <label v-if="p.trigger.on === 'ingest' || p.trigger.on === 'in'">{{ words.kinds }}
              <input data-field="trigger-kinds" placeholder="pdf, docx" :value="p.trigger.kinds.join(', ')"
                @change="apply([{ op: 'setTrigger', kinds: value($event).split(/[,\s]+/).map((k) => k.replace(/^\./, '').trim()).filter(Boolean) }])" />
            </label>
            <label v-if="p.trigger.on === 'ingest' || p.trigger.on === 'in' || p.trigger.on === 'commit'">{{ words.folder }}
              <input data-field="trigger-folder" :value="p.trigger.folder" @change="apply([{ op: 'setTrigger', folder: value($event).trim() }])" />
            </label>
            <label v-if="p.trigger.on === 'in' || p.trigger.on === 'commit'">{{ words.match }}
              <input data-field="trigger-match" :placeholder="p.trigger.on === 'commit' ? '*.md' : '*.pdf'" :value="p.trigger.match"
                @change="apply([{ op: 'setTrigger', match: value($event).trim() }])" />
            </label>
            <label v-if="p.trigger.on === 'commit'">{{ words.skip }}
              <input data-field="trigger-skip" placeholder="pipelines/import" :value="p.trigger.skip.join(', ')"
                @change="apply([{ op: 'setTrigger', skip: list(value($event)) }])" />
            </label>
            <template v-if="p.trigger.on === 'run'">
              <label>{{ words.runEnds }}
                <input data-field="trigger-status" placeholder="failed" :value="p.trigger.status.join(', ')"
                  @change="apply([{ op: 'setTrigger', status: list(value($event)) }])" />
              </label>
              <label>{{ words.pipelines }}
                <input data-field="trigger-pipelines" placeholder="pipelines/*" :value="p.trigger.pipelines"
                  @change="apply([{ op: 'setTrigger', pipelines: value($event).trim() }])" />
              </label>
            </template>
            <template v-if="p.trigger.on === 'in'">
              <label>{{ words.batch }}
                <select data-field="trigger-batch" :value="p.trigger.batch ? 'yes' : 'no'"
                  @change="apply([{ op: 'setTrigger', batch: value($event) === 'yes' }])">
                  <option value="no">{{ words.no }}</option>
                  <option value="yes">{{ words.yes }}</option>
                </select>
              </label>
            </template>
            <label v-if="p.trigger.on === 'schedule'">{{ words.every }}
              <input data-field="trigger-every" placeholder="monday 09:00" :value="p.trigger.every" @change="apply([{ op: 'setTrigger', every: value($event).trim() }])" />
            </label>
          </template>

          <template v-else-if="edge">
            <h3>{{ words.edge }} <code>{{ edge.from === 'trigger' ? words.trigger : edge.from }} → {{ edge.to }}</code></h3>
            <p class="pd-editor__hint">{{ edge.from === 'trigger' ? words.startsAtOnce : words.edgeHint }}</p>
          </template>

          <p v-else class="pd-editor__hint">{{ words.connectHint }}</p>
        </aside>
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
      <template v-if="read.problems.length || problems.length">
        <template v-if="read.problems.length">
          {{ words.problems }}
          <ul>
            <li v-for="(pr, i) in read.problems" :key="i">
              <button v-if="pr.line" type="button" @click="goToLine(pr.line)">{{ words.line }} {{ pr.line }}</button>: {{ pr.message }}
            </li>
          </ul>
        </template>
        <p v-for="(sp, i) in problems" :key="`s${i}`" data-server-problem>{{ words.serverProblem }} {{ sp }}</p>
      </template>
      <span v-else>{{ words.noProblems }}</span>
    </div>
  </div>
</template>
