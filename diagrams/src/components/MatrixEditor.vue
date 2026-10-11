<script setup lang="ts">
import { computed } from 'vue'
import type { Diagram } from '../model/types'
import type { DiagramOp } from '../edit/edit'
import type { DiagramEditorLabels } from '../labels'

// A matrix as a form: the quadrants' axes, names and points (which are
// also dragged on the drawing beside it), or the grid as a table of its
// rows, columns and cells. It says operations, and follows the YAML.
const props = defineProps<{
  diagram: Diagram
  labels: DiagramEditorLabels
  linksId: string
  suggest: (q: string) => void
  selected: number | null
}>()
const emit = defineEmits<{ ops: [ops: DiagramOp[], key?: string]; 'update:selected': [i: number | null] }>()

const m = computed(() => props.diagram.matrix!)
const grid = computed(() => m.value.rows.length > 0)
const value = (e: Event) => (e.target as HTMLInputElement).value

function axis(name: 'x' | 'y', field: 'label' | 'low' | 'high', v: string) {
  emit('ops', [{ op: 'setAxis', axis: name, [field]: v }], `axis:${name}:${field}`)
}

function coord(index: number, name: 'x' | 'y', raw: string) {
  const n = Number(raw)
  if (raw !== '' && Number.isFinite(n)) emit('ops', [{ op: 'updateItem', index, [name]: n }], `item:${index}:${name}`)
}

function addItem() {
  emit('ops', [{ op: 'addItem', label: props.labels.newItem, x: 0.5, y: 0.5 }])
  emit('update:selected', m.value.items.length)
}
</script>

<template>
  <div class="pd-form" data-form="matrix">
    <template v-if="!grid">
      <section v-for="name in (['x', 'y'] as const)" :key="name" class="pd-form__axis">
        <h3>{{ name === 'x' ? labels.axisX : labels.axisY }}</h3>
        <div class="pd-form__row">
          <input
            :data-field="`${name}-label`"
            :value="m[name]?.label ?? ''"
            :aria-label="labels.axisName"
            :placeholder="labels.axisName"
            @input="axis(name, 'label', value($event))"
          />
          <input
            :data-field="`${name}-low`"
            :value="m[name]?.low ?? ''"
            :aria-label="labels.low"
            :placeholder="labels.low"
            @input="axis(name, 'low', value($event))"
          />
          <input
            :data-field="`${name}-high`"
            :value="m[name]?.high ?? ''"
            :aria-label="labels.high"
            :placeholder="labels.high"
            @input="axis(name, 'high', value($event))"
          />
        </div>
      </section>
      <section>
        <h3>{{ labels.quadrants }}</h3>
        <div class="pd-form__quadrants">
          <input
            v-for="(qn, i) in labels.quadrantNames"
            :key="i"
            :data-field="`quadrant-${i}`"
            :value="m.quadrants[i] ?? ''"
            :aria-label="qn"
            :placeholder="qn"
            @input="emit('ops', [{ op: 'setQuadrant', index: i, label: value($event) }], `quadrant:${i}`)"
          />
        </div>
      </section>
      <section>
        <h3>{{ labels.items }}</h3>
        <div
          v-for="(it, i) in m.items"
          :key="i"
          class="pd-form__row"
          data-row="item"
          :data-selected="selected === i ? '' : undefined"
          @focusin="emit('update:selected', i)"
        >
          <input
            data-field="item-label"
            :value="it.label"
            :aria-label="labels.label"
            @input="emit('ops', [{ op: 'updateItem', index: i, label: value($event) }], `item:${i}:label`)"
          />
          <input
            class="pd-form__number"
            type="number"
            min="0"
            max="1"
            step="0.05"
            data-field="item-x"
            :value="it.x"
            aria-label="x"
            @input="coord(i, 'x', value($event))"
          />
          <input
            class="pd-form__number"
            type="number"
            min="0"
            max="1"
            step="0.05"
            data-field="item-y"
            :value="it.y"
            aria-label="y"
            @input="coord(i, 'y', value($event))"
          />
          <input
            data-field="item-link"
            :value="it.link"
            :placeholder="labels.linkHint"
            :aria-label="labels.link"
            :list="linksId"
            @input="suggest(value($event)); emit('ops', [{ op: 'updateItem', index: i, link: value($event) }], `item:${i}:link`)"
          />
          <button
            type="button"
            :title="labels.remove"
            :aria-label="labels.remove"
            @click="emit('ops', [{ op: 'removeItem', index: i }]); emit('update:selected', null)"
          >✕</button>
        </div>
        <button type="button" data-action="add-item" @click="addItem">{{ labels.addItem }}</button>
        <p class="pd-editor__hint">{{ labels.dragHint }}</p>
      </section>
    </template>

    <div v-else class="pd-form__grid-wrap">
      <table class="pd-form__grid">
        <thead>
          <tr>
            <th />
            <th v-for="(c, j) in m.columns" :key="j">
              <input
                :data-field="`column-${j}`"
                :value="c"
                :aria-label="`${labels.columns} ${j + 1}`"
                @input="emit('ops', [{ op: 'renameColumn', index: j, label: value($event) }], `column:${j}`)"
              />
              <button
                type="button"
                :title="labels.removeColumn"
                :aria-label="labels.removeColumn"
                :disabled="m.columns.length <= 1"
                @click="emit('ops', [{ op: 'removeColumn', index: j }])"
              >✕</button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in m.rows" :key="i">
            <th>
              <input
                :data-field="`row-${i}`"
                :value="r"
                :aria-label="`${labels.rows} ${i + 1}`"
                @input="emit('ops', [{ op: 'renameRow', index: i, label: value($event) }], `row:${i}`)"
              />
              <button
                type="button"
                :title="labels.removeRow"
                :aria-label="labels.removeRow"
                :disabled="m.rows.length <= 1"
                @click="emit('ops', [{ op: 'removeRow', index: i }])"
              >✕</button>
            </th>
            <td v-for="(_, j) in m.columns" :key="j">
              <input
                :data-field="`cell-${i}-${j}`"
                :value="m.cells[i]?.[j] ?? ''"
                :aria-label="`${r} · ${m.columns[j]}`"
                @input="emit('ops', [{ op: 'setCell', row: i, column: j, text: value($event) }], `cell:${i}:${j}`)"
              />
            </td>
          </tr>
        </tbody>
      </table>
      <div class="pd-form__row">
        <button type="button" data-action="add-row" @click="emit('ops', [{ op: 'addRow', index: m.rows.length, label: labels.newRow }])">
          {{ labels.addRow }}
        </button>
        <button type="button" data-action="add-column" @click="emit('ops', [{ op: 'addColumn', index: m.columns.length, label: labels.newColumn }])">
          {{ labels.addColumn }}
        </button>
      </div>
    </div>
  </div>
</template>
