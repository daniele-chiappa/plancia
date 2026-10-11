<script setup lang="ts">
import { computed } from 'vue'
import type { Diagram } from '../model/types'
import type { DiagramOp } from '../edit/edit'
import type { DiagramEditorLabels } from '../labels'

// The sets and the shared parts of a Venn as a form: a set's label and
// link, a part's sets, label and size. Like the other editors it changes
// nothing itself: it says operations, and follows the YAML they make.
const props = defineProps<{ diagram: Diagram; labels: DiagramEditorLabels; linksId: string; suggest: (q: string) => void }>()
const emit = defineEmits<{ ops: [ops: DiagramOp[], key?: string] }>()

const value = (e: Event) => (e.target as HTMLInputElement).value

/** The sets of a part in the order of the sets. */
const ordered = (ids: string[]) => props.diagram.sets.map((s) => s.id).filter((id) => ids.includes(id))

function toggle(index: number, id: string, on: boolean) {
  const a = props.diagram.areas[index]
  if (!a) return
  const next = ordered(on ? [...a.sets, id] : a.sets.filter((s) => s !== id))
  if (next.length) emit('ops', [{ op: 'updateArea', index, sets: next }])
}

/** The first combination of sets no part has yet: pairs first, then larger. */
const free = computed<string[] | null>(() => {
  const ids = props.diagram.sets.map((s) => s.id)
  const have = new Set(props.diagram.areas.map((a) => [...a.sets].sort().join('+')))
  for (let size = 2; size <= ids.length; size++) {
    const pick = (from: number, chosen: string[]): string[] | null => {
      if (chosen.length === size) return have.has([...chosen].sort().join('+')) ? null : chosen
      for (let i = from; i < ids.length; i++) {
        const r = pick(i + 1, [...chosen, ids[i]!])
        if (r) return r
      }
      return null
    }
    const found = pick(0, [])
    if (found) return found
  }
  return null
})

function size(index: number, raw: string) {
  const n = raw === '' ? 0 : Number(raw)
  if (Number.isFinite(n) && n >= 0) emit('ops', [{ op: 'updateArea', index, size: n }], `area:${index}:size`)
}
</script>

<template>
  <div class="pd-form" data-form="venn">
    <section>
      <h3>{{ labels.sets }}</h3>
      <div v-for="s in diagram.sets" :key="s.id" class="pd-form__row" data-row="set">
        <input
          data-field="set-label"
          :value="s.label"
          :aria-label="`${labels.label} ${s.id}`"
          @input="emit('ops', [{ op: 'updateSet', id: s.id, label: value($event) }], `set:${s.id}:label`)"
        />
        <input
          data-field="set-link"
          :value="s.link"
          :placeholder="labels.linkHint"
          :aria-label="labels.link"
          :list="linksId"
          @input="suggest(value($event)); emit('ops', [{ op: 'updateSet', id: s.id, link: value($event) }], `set:${s.id}:link`)"
        />
        <button
          type="button"
          :title="labels.remove"
          :aria-label="labels.remove"
          :disabled="diagram.sets.length <= 2"
          @click="emit('ops', [{ op: 'removeSet', id: s.id }])"
        >✕</button>
      </div>
      <button
        type="button"
        data-action="add-set"
        :disabled="diagram.sets.length >= 5"
        @click="emit('ops', [{ op: 'addSet', label: labels.newSet }])"
      >{{ labels.addSet }}</button>
    </section>
    <section>
      <h3>{{ labels.areas }}</h3>
      <div v-for="(a, i) in diagram.areas" :key="i" class="pd-form__row pd-form__area" data-row="area">
        <span class="pd-form__chips">
          <label v-for="s in diagram.sets" :key="s.id">
            <input type="checkbox" :checked="a.sets.includes(s.id)" @change="toggle(i, s.id, ($event.target as HTMLInputElement).checked)" />
            {{ s.label }}
          </label>
        </span>
        <input
          data-field="area-label"
          :value="a.label"
          :aria-label="labels.label"
          :placeholder="labels.label"
          @input="emit('ops', [{ op: 'updateArea', index: i, label: value($event) }], `area:${i}:label`)"
        />
        <input
          class="pd-form__number"
          type="number"
          min="0"
          step="1"
          data-field="area-size"
          :value="a.size || ''"
          :aria-label="labels.size"
          :title="labels.sizeHint"
          :placeholder="labels.size"
          @input="size(i, value($event))"
        />
        <button type="button" :title="labels.remove" :aria-label="labels.remove" @click="emit('ops', [{ op: 'removeArea', index: i }])">✕</button>
      </div>
      <button type="button" data-action="add-area" :disabled="!free" @click="free && emit('ops', [{ op: 'addArea', sets: free }])">
        {{ labels.addArea }}
      </button>
    </section>
  </div>
</template>
