<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue'
import { completeExpr, exprAt, type ExprSuggestion } from '../pipeline/expr'

// A text field of a pipeline node that offers the {{ }} references: typing
// {{ opens a list of what the node may read, filtered by what follows;
// ↑ ↓ choose, Enter or Tab put it in, Escape closes the list. A text of
// several lines (multiline) is a text area.
const props = defineProps<{
  value: string
  suggestions: ExprSuggestion[]
  multiline?: boolean
  code?: boolean
  placeholder?: string
  label?: string
  field?: string
}>()
const emit = defineEmits<{ input: [value: string]; commit: [value: string] }>()

const uid = useId()
const el = ref<HTMLInputElement | HTMLTextAreaElement | null>(null)
const open = ref(false)
const active = ref(0)
const query = ref('')

const shown = computed(() => {
  const q = query.value.toLowerCase()
  return props.suggestions.filter((s) => s.ref.toLowerCase().startsWith(q) || s.ref.toLowerCase().includes(`.${q}`)).slice(0, 12)
})

function refresh() {
  const e = el.value
  if (!e) return
  const at = exprAt(e.value, e.selectionStart ?? e.value.length)
  open.value = !!at && shown.value.length >= 0
  query.value = at?.query ?? ''
  if (active.value >= shown.value.length) active.value = 0
  if (!at) open.value = false
}

function onInput(ev: Event) {
  emit('input', (ev.target as HTMLInputElement).value)
  refresh()
}

async function choose(s: ExprSuggestion) {
  const e = el.value
  if (!e) return
  const r = completeExpr(e.value, e.selectionStart ?? e.value.length, s.ref)
  e.value = r.text
  emit('input', r.text)
  open.value = false
  await nextTick()
  e.focus()
  e.setSelectionRange(r.cursor, r.cursor)
}

function onKey(ev: KeyboardEvent) {
  if (!open.value || !shown.value.length) return
  if (ev.key === 'ArrowDown') {
    ev.preventDefault()
    active.value = (active.value + 1) % shown.value.length
  } else if (ev.key === 'ArrowUp') {
    ev.preventDefault()
    active.value = (active.value - 1 + shown.value.length) % shown.value.length
  } else if (ev.key === 'Enter' || ev.key === 'Tab') {
    ev.preventDefault()
    void choose(shown.value[active.value]!)
  } else if (ev.key === 'Escape') {
    ev.stopPropagation()
    open.value = false
  }
}

const listId = `${uid}-refs`
</script>

<template>
  <span class="pd-expr">
    <textarea
      v-if="multiline || code"
      ref="el"
      class="pd-expr__input"
      :class="{ 'pd-expr__input--code': code }"
      :data-field="field"
      :value="value"
      :placeholder="placeholder"
      :aria-label="label"
      :rows="code ? 6 : 3"
      spellcheck="false"
      role="combobox"
      :aria-expanded="open"
      :aria-controls="listId"
      @input="onInput"
      @keydown="onKey"
      @click="refresh"
      @blur="open = false; emit('commit', ($event.target as HTMLTextAreaElement).value)"
    />
    <input
      v-else
      ref="el"
      class="pd-expr__input"
      :data-field="field"
      :value="value"
      :placeholder="placeholder"
      :aria-label="label"
      spellcheck="false"
      role="combobox"
      :aria-expanded="open"
      :aria-controls="listId"
      @input="onInput"
      @keydown="onKey"
      @click="refresh"
      @blur="open = false; emit('commit', ($event.target as HTMLInputElement).value)"
    />
    <ul v-if="open && shown.length" :id="listId" class="pd-expr__list" role="listbox">
      <li
        v-for="(s, i) in shown"
        :key="s.ref"
        role="option"
        :aria-selected="i === active"
        :data-ref="s.ref"
        @mousedown.prevent="choose(s)"
      >
        <code>{{ s.ref }}</code>
        <span v-if="s.detail">{{ s.detail }}</span>
      </li>
    </ul>
  </span>
</template>
