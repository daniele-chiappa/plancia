<script setup lang="ts">
import { computed } from 'vue'
import type { Diagram, GanttTask } from '../model/types'
import { TASK_STATUSES } from '../model/types'
import type { DiagramOp, TaskRef } from '../edit/edit'
import type { DiagramEditorLabels } from '../labels'

// A Gantt as a table of its tasks, section by section: a task's name, when
// it starts (on a date, or after another task), how long it lasts (days, or
// until a date), its status and link. It says operations, and follows the
// YAML. `sections` says whether the YAML has sections (else one list of tasks).
const props = defineProps<{
  diagram: Diagram
  labels: DiagramEditorLabels
  linksId: string
  suggest: (q: string) => void
  sections: boolean
  today: string
}>()
const emit = defineEmits<{ ops: [ops: DiagramOp[], key?: string] }>()

const value = (e: Event) => (e.target as HTMLInputElement).value
const all = computed(() => props.diagram.sections.flatMap((s, si) => s.tasks.map((t, ti) => ({ t, ref: { section: si, index: ti } }))))
const known = computed(() => new Set(all.value.map((x) => x.t.id).filter(Boolean)))

/** An id no task, set, node or branch has yet. */
function freshId(): string {
  let i = 1
  while (known.value.has(`t${i}`)) i++
  return `t${i}`
}

/** When each task with an id starts and ends, its after chain followed: YYYY-MM-DD, both days in. */
const schedule = computed(() => {
  const out = new Map<string, { start: string; end: string }>()
  const byId = new Map(all.value.filter((x) => x.t.id).map((x) => [x.t.id, x.t]))
  const day = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
  const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10)
  const at = (t: GanttTask, seen: Set<string>): { start: string; end: string } | null => {
    if (t.id && out.has(t.id)) return out.get(t.id)!
    let start = t.start
    if (t.after) {
      const prev = byId.get(t.after)
      if (!prev || seen.has(t.after)) return null
      const p = at(prev, new Set([...seen, t.after]))
      if (!p) return null
      start = ymd(day(p.end) + 86400000)
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null
    const end = t.end || ymd(day(start) + (Math.max(t.days, 1) - 1) * 86400000)
    const r = { start, end }
    if (t.id) out.set(t.id, r)
    return r
  }
  return (t: GanttTask) => at(t, new Set(t.id ? [t.id] : []))
})

const key = (r: TaskRef, f: string) => `task:${r.section}.${r.index}:${f}`
const update = (r: TaskRef, f: Record<string, unknown>, k?: string) => emit('ops', [{ op: 'updateTask', task: r, ...f }], k)

function startMode(r: TaskRef, t: GanttTask, mode: string) {
  if (mode === 'date') update(r, { start: t.start || schedule.value(t)?.start || props.today })
  else {
    // After the task before it, given an id when it has none.
    const before = all.value.findIndex((x) => x.ref.section === r.section && x.ref.index === r.index) - 1
    const prev = all.value[before]
    if (!prev) return
    const ops: DiagramOp[] = []
    let id = prev.t.id
    if (!id) {
      id = freshId()
      ops.push({ op: 'updateTask', task: prev.ref, id })
    }
    ops.push({ op: 'updateTask', task: r, after: id })
    emit('ops', ops)
  }
}

function afterTask(r: TaskRef, target: string) {
  const hit = all.value.find((x) => `${x.ref.section}.${x.ref.index}` === target)
  if (!hit) return
  const ops: DiagramOp[] = []
  let id = hit.t.id
  if (!id) {
    id = freshId()
    ops.push({ op: 'updateTask', task: hit.ref, id })
  }
  ops.push({ op: 'updateTask', task: r, after: id })
  emit('ops', ops)
}

function endMode(r: TaskRef, t: GanttTask, mode: string) {
  if (mode === 'days') update(r, { days: t.days || 1 })
  else update(r, { end: t.end || schedule.value(t)?.end || props.today })
}

function days(r: TaskRef, raw: string) {
  const n = Number(raw)
  if (Number.isInteger(n) && n >= 1) update(r, { days: n }, key(r, 'days'))
}

function addTask(section: number) {
  const tasks = props.diagram.sections[section]?.tasks ?? []
  const last = tasks[tasks.length - 1]
  const ops: DiagramOp[] = []
  let after = last?.id ?? ''
  if (last && !after) {
    after = freshId()
    ops.push({ op: 'updateTask', task: { section, index: tasks.length - 1 }, id: after })
  }
  ops.push({
    op: 'addTask',
    section,
    index: tasks.length,
    label: props.labels.newTask,
    ...(after ? { after } : { start: props.today }),
    days: 1,
  })
  emit('ops', ops)
}

const otherTasks = (r: TaskRef) => all.value.filter((x) => !(x.ref.section === r.section && x.ref.index === r.index))
const afterOf = (t: GanttTask) => {
  const hit = all.value.find((x) => x.t.id === t.after)
  return hit ? `${hit.ref.section}.${hit.ref.index}` : ''
}
const count = (s: number) => props.diagram.sections[s]?.tasks.length ?? 0
</script>

<template>
  <div class="pd-form" data-form="gantt">
    <section v-for="(s, si) in diagram.sections" :key="si" data-row="section">
      <div v-if="sections" class="pd-form__row pd-form__section">
        <input
          data-field="section-label"
          :value="s.label"
          :aria-label="labels.sections"
          :placeholder="labels.sections"
          @input="emit('ops', [{ op: 'renameSection', index: si, label: value($event) }], `section:${si}`)"
        />
        <button
          type="button"
          :title="labels.remove"
          :aria-label="labels.remove"
          :disabled="diagram.sections.length <= 1"
          @click="emit('ops', [{ op: 'removeSection', index: si }])"
        >✕</button>
      </div>
      <div v-for="(t, ti) in s.tasks" :key="ti" class="pd-form__task" data-row="task">
        <input
          class="pd-form__task-label"
          data-field="task-label"
          :value="t.label"
          :aria-label="labels.task"
          @input="update({ section: si, index: ti }, { label: value($event) }, key({ section: si, index: ti }, 'label'))"
        />
        <label class="pd-form__inline">
          {{ labels.starts }}
          <select
            data-field="task-start-mode"
            :value="t.after ? 'after' : 'date'"
            @change="startMode({ section: si, index: ti }, t, value($event))"
          >
            <option value="date">{{ labels.onDate }}</option>
            <option value="after" :disabled="!otherTasks({ section: si, index: ti }).length">{{ labels.afterTask }}</option>
          </select>
        </label>
        <input
          v-if="!t.after"
          type="date"
          data-field="task-start"
          :value="t.start"
          :aria-label="labels.onDate"
          @change="value($event) && update({ section: si, index: ti }, { start: value($event) })"
        />
        <select v-else data-field="task-after" :value="afterOf(t)" :aria-label="labels.afterTask" @change="afterTask({ section: si, index: ti }, value($event))">
          <option v-for="o in otherTasks({ section: si, index: ti })" :key="`${o.ref.section}.${o.ref.index}`" :value="`${o.ref.section}.${o.ref.index}`">
            {{ o.t.label }}
          </option>
        </select>
        <template v-if="t.status !== 'milestone'">
          <label class="pd-form__inline">
            {{ labels.lasts }}
            <select data-field="task-end-mode" :value="t.end ? 'end' : 'days'" @change="endMode({ section: si, index: ti }, t, value($event))">
              <option value="days">{{ labels.days }}</option>
              <option value="end">{{ labels.untilDate }}</option>
            </select>
          </label>
          <input
            v-if="!t.end"
            class="pd-form__number"
            type="number"
            min="1"
            step="1"
            data-field="task-days"
            :value="t.days || ''"
            :aria-label="labels.days"
            @input="days({ section: si, index: ti }, value($event))"
          />
          <input
            v-else
            type="date"
            data-field="task-end"
            :value="t.end"
            :aria-label="labels.untilDate"
            @change="value($event) && update({ section: si, index: ti }, { end: value($event) })"
          />
        </template>
        <select data-field="task-status" :value="t.status" :aria-label="labels.status" @change="update({ section: si, index: ti }, { status: value($event) })">
          <option value="">{{ labels.none }}</option>
          <option v-for="st in TASK_STATUSES" :key="st" :value="st">{{ labels.statuses[st] }}</option>
        </select>
        <input
          data-field="task-link"
          :value="t.link"
          :placeholder="labels.linkHint"
          :aria-label="labels.link"
          :list="linksId"
          @input="suggest(value($event)); update({ section: si, index: ti }, { link: value($event) }, key({ section: si, index: ti }, 'link'))"
        />
        <span class="pd-form__moves">
          <button
            type="button"
            :title="labels.moveUp"
            :aria-label="labels.moveUp"
            :disabled="ti === 0 && si === 0"
            @click="emit('ops', [{ op: 'moveTask', task: { section: si, index: ti }, section: ti === 0 ? si - 1 : si, index: ti === 0 ? count(si - 1) : ti - 1 }])"
          >↑</button>
          <button
            type="button"
            :title="labels.moveDown"
            :aria-label="labels.moveDown"
            :disabled="ti === s.tasks.length - 1 && si === diagram.sections.length - 1"
            @click="emit('ops', [{ op: 'moveTask', task: { section: si, index: ti }, section: ti === s.tasks.length - 1 ? si + 1 : si, index: ti === s.tasks.length - 1 ? 0 : ti + 2 }])"
          >↓</button>
          <button type="button" :title="labels.remove" :aria-label="labels.remove" @click="emit('ops', [{ op: 'removeTask', task: { section: si, index: ti } }])">✕</button>
        </span>
      </div>
      <button type="button" data-action="add-task" @click="addTask(si)">{{ labels.addTask }}</button>
    </section>
    <button type="button" data-action="add-section" @click="emit('ops', [{ op: 'addSection', index: diagram.sections.length, label: labels.newSection }])">
      {{ labels.addSection }}
    </button>
  </div>
</template>
